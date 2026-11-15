import CoreGraphics
import Foundation
import ImageIO
import Vision

struct Request: Decodable {
    let image: String
}

struct Fragment {
    let text: String
    let minX: CGFloat
    let maxX: CGFloat
    let minY: CGFloat
    let maxY: CGFloat
}

let textRequest: VNRecognizeTextRequest = {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ru-RU", "en-US"]
    request.usesLanguageCorrection = false
    return request
}()

func emit(_ fields: [String: String], to output: FileHandle) {
    let data = try? JSONSerialization.data(withJSONObject: fields, options: [])
    guard var line = data else { return }
    line.append(0x0A)
    try? output.write(contentsOf: line)
    try? output.synchronize()
}

func orientation(of source: CGImageSource) -> CGImagePropertyOrientation {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let raw = properties[kCGImagePropertyOrientation] as? UInt32,
          let value = CGImagePropertyOrientation(rawValue: raw) else {
        return .up
    }
    return value
}

func loadImage(at path: String) -> (CGImage, CGImagePropertyOrientation)? {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return nil
    }
    return (image, orientation(of: source))
}

func sameLine(_ line: [Fragment], _ item: Fragment) -> Bool {
    let minY = line.map(\.minY).min() ?? item.minY
    let maxY = line.map(\.maxY).max() ?? item.maxY
    let overlap = min(maxY, item.maxY) - max(minY, item.minY)
    let itemHeight = max(item.maxY - item.minY, 0.0001)
    let lineHeight = max(maxY - minY, 0.0001)
    return overlap > min(itemHeight, lineHeight) * 0.45
}

func joinLine(_ items: [Fragment]) -> String {
    let sorted = items.sorted { $0.minX < $1.minX }
    var text = ""
    var lastMaxX: CGFloat = -1
    for item in sorted {
        if text.isEmpty {
            text = item.text
        } else if item.minX - lastMaxX > 0.008 {
            text += " " + item.text
        } else {
            text += item.text
        }
        lastMaxX = max(lastMaxX, item.maxX)
    }
    return text
}

func assemble(_ observations: [VNRecognizedTextObservation]) -> String {
    let items: [Fragment] = observations.compactMap { observation in
        guard let raw = observation.topCandidates(1).first?.string else { return nil }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let box = observation.boundingBox
        return Fragment(text: text, minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY)
    }
    let sorted = items.sorted {
        if $0.maxY != $1.maxY { return $0.maxY > $1.maxY }
        return $0.minX < $1.minX
    }
    var lines: [[Fragment]] = []
    for item in sorted {
        if var last = lines.last, sameLine(last, item) {
            last.append(item)
            lines[lines.count - 1] = last
        } else {
            lines.append([item])
        }
    }
    return lines.map(joinLine).joined(separator: "\n")
}

func recognize(path: String) throws -> String {
    guard let loaded = loadImage(at: path) else {
        throw NSError(domain: "ocrat", code: 1)
    }
    let handler = VNImageRequestHandler(cgImage: loaded.0, orientation: loaded.1, options: [:])
    try handler.perform([textRequest])
    return assemble(textRequest.results ?? [])
}

func handle(line: Data, output: FileHandle) {
    guard !line.isEmpty,
          let request = try? JSONDecoder().decode(Request.self, from: line) else {
        emit(["error": "bad-request"], to: output)
        return
    }
    do {
        emit(["text": try recognize(path: request.image)], to: output)
    } catch let error as NSError where error.domain == "ocrat" {
        emit(["error": "decode-failed"], to: output)
    } catch {
        emit(["error": "ocr-failed"], to: output)
    }
}

let input = FileHandle.standardInput
let output = FileHandle.standardOutput
var buffer = Data()
while true {
    let chunk = input.availableData
    if chunk.isEmpty { break }
    buffer.append(chunk)
    while let newline = buffer.firstIndex(of: 0x0A) {
        var line = buffer.subdata(in: buffer.startIndex..<newline)
        buffer.removeSubrange(buffer.startIndex...newline)
        if line.last == 0x0D { line.removeLast() }
        autoreleasepool {
            handle(line: line, output: output)
        }
    }
}
