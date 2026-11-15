#define UNICODE
#define _UNICODE
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shcore.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Globalization.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.Ocr.h>
#include <winrt/Windows.Storage.Streams.h>

#include <io.h>
#include <fcntl.h>
#include <stdio.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

using namespace winrt;
using namespace Windows::Globalization;
using namespace Windows::Graphics::Imaging;
using namespace Windows::Media::Ocr;
using namespace Windows::Storage::Streams;

struct Word {
    std::wstring text;
    double x = 0;
    double y = 0;
    double w = 0;
    double h = 0;
    bool russian = false;
};

struct Engines {
    OcrEngine russian{ nullptr };
    OcrEngine english{ nullptr };
    bool ready = false;
};

Engines engines;

std::wstring utf8ToWide(const std::string& value) {
    if (value.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (size <= 0) throw std::runtime_error("bad-request");
    std::wstring out(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), out.data(), size);
    return out;
}

std::string wideToUtf8(const std::wstring& value) {
    if (value.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (size <= 0) return "";
    std::string out(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), out.data(), size, nullptr, nullptr);
    return out;
}

std::string escapeJson(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (unsigned char c : value) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out.push_back(static_cast<char>(c));
                }
        }
    }
    return out;
}

void respond(const char* key, const std::string& value) {
    std::string line = std::string("{\"") + key + "\":\"" + escapeJson(value) + "\"}\n";
    _write(_fileno(stdout), line.data(), static_cast<unsigned>(line.size()));
}

void appendUtf8(std::string& out, uint32_t codepoint) {
    if (codepoint <= 0x7F) {
        out.push_back(static_cast<char>(codepoint));
    } else if (codepoint <= 0x7FF) {
        out.push_back(static_cast<char>(0xC0 | (codepoint >> 6)));
        out.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
    } else if (codepoint <= 0xFFFF) {
        out.push_back(static_cast<char>(0xE0 | (codepoint >> 12)));
        out.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (codepoint >> 18)));
        out.push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
    }
}

int hexValue(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

std::optional<std::string> parseImagePath(const std::string& line) {
    const auto key = line.find("\"image\"");
    if (key == std::string::npos) return std::nullopt;
    const auto colon = line.find(':', key + 7);
    if (colon == std::string::npos) return std::nullopt;
    const auto quote = line.find('"', colon + 1);
    if (quote == std::string::npos) return std::nullopt;
    std::string out;
    for (size_t i = quote + 1; i < line.size(); ++i) {
        unsigned char c = static_cast<unsigned char>(line[i]);
        if (c == '"') return out;
        if (c != '\\') {
            out.push_back(static_cast<char>(c));
            continue;
        }
        if (++i >= line.size()) return std::nullopt;
        char escaped = line[i];
        switch (escaped) {
            case '"':
            case '\\':
            case '/': out.push_back(escaped); break;
            case 'b': out.push_back('\b'); break;
            case 'f': out.push_back('\f'); break;
            case 'n': out.push_back('\n'); break;
            case 'r': out.push_back('\r'); break;
            case 't': out.push_back('\t'); break;
            case 'u': {
                if (i + 4 >= line.size()) return std::nullopt;
                uint32_t codepoint = 0;
                for (int k = 0; k < 4; ++k) {
                    int nibble = hexValue(line[++i]);
                    if (nibble < 0) return std::nullopt;
                    codepoint = (codepoint << 4) | static_cast<uint32_t>(nibble);
                }
                appendUtf8(out, codepoint);
                break;
            }
            default: return std::nullopt;
        }
    }
    return std::nullopt;
}

bool hasRange(const std::wstring& text, wchar_t first, wchar_t last) {
    return std::any_of(text.begin(), text.end(), [&](wchar_t c) { return c >= first && c <= last; });
}

bool hasCyrillic(const std::wstring& text) {
    return hasRange(text, 0x0400, 0x052F);
}

bool hasLatin(const std::wstring& text) {
    for (wchar_t c : text) {
        if ((c >= L'A' && c <= L'Z') || (c >= L'a' && c <= L'z') || (c >= 0x00C0 && c <= 0x024F)) return true;
    }
    return false;
}

int preference(const Word& word) {
    int score = static_cast<int>(word.text.size());
    const bool cyr = hasCyrillic(word.text);
    const bool lat = hasLatin(word.text);
    if (word.russian && cyr) score += 100;
    if (!word.russian && lat) score += 100;
    if (word.russian && lat && !cyr) score -= 50;
    if (!word.russian && cyr && !lat) score -= 50;
    return score;
}

double intersectionOverUnion(const Word& a, const Word& b) {
    const double x1 = std::max(a.x, b.x);
    const double y1 = std::max(a.y, b.y);
    const double x2 = std::min(a.x + a.w, b.x + b.w);
    const double y2 = std::min(a.y + a.h, b.y + b.h);
    const double w = x2 - x1;
    const double h = y2 - y1;
    if (w <= 0 || h <= 0) return 0;
    const double inter = w * h;
    const double uni = a.w * a.h + b.w * b.h - inter;
    if (uni <= 0) return 0;
    return inter / uni;
}

bool sameLine(const std::vector<Word>& line, const Word& item) {
    double minY = line[0].y;
    double maxY = line[0].y + line[0].h;
    for (const Word& word : line) {
        minY = std::min(minY, word.y);
        maxY = std::max(maxY, word.y + word.h);
    }
    const double overlap = std::min(maxY, item.y + item.h) - std::max(minY, item.y);
    const double itemHeight = std::max(item.h, 1.0);
    const double lineHeight = std::max(maxY - minY, 1.0);
    return overlap > std::min(itemHeight, lineHeight) * 0.45;
}

std::wstring joinLine(std::vector<Word> words) {
    std::sort(words.begin(), words.end(), [](const Word& a, const Word& b) { return a.x < b.x; });
    std::wstring out;
    for (const Word& word : words) {
        if (out.empty()) out = word.text;
        else out += L" " + word.text;
    }
    return out;
}

std::wstring assemble(std::vector<Word> words) {
    std::sort(words.begin(), words.end(), [](const Word& a, const Word& b) {
        if (std::abs(a.y - b.y) > 1.0) return a.y < b.y;
        return a.x < b.x;
    });
    std::vector<Word> kept;
    for (const Word& candidate : words) {
        int match = -1;
        double best = 0;
        for (int i = 0; i < static_cast<int>(kept.size()); ++i) {
            const double score = intersectionOverUnion(kept[i], candidate);
            if (score > 0.5 && score > best) {
                best = score;
                match = i;
            }
        }
        if (match < 0) {
            kept.push_back(candidate);
            continue;
        }
        if (preference(candidate) > preference(kept[match])) kept[match] = candidate;
    }
    std::sort(kept.begin(), kept.end(), [](const Word& a, const Word& b) {
        if (std::abs(a.y - b.y) > 1.0) return a.y < b.y;
        return a.x < b.x;
    });
    std::vector<std::vector<Word>> lines;
    for (const Word& word : kept) {
        if (!lines.empty() && sameLine(lines.back(), word)) lines.back().push_back(word);
        else lines.push_back({ word });
    }
    std::wstring text;
    for (auto& line : lines) {
        if (!text.empty()) text += L"\n";
        text += joinLine(std::move(line));
    }
    return text;
}

void collect(OcrEngine engine, bool russian, SoftwareBitmap bitmap, std::vector<Word>& out) {
    auto result = engine.RecognizeAsync(bitmap).get();
    for (auto const& line : result.Lines()) {
        for (auto const& word : line.Words()) {
            auto rect = word.BoundingRect();
            Word item;
            item.text = word.Text().c_str();
            item.x = rect.X;
            item.y = rect.Y;
            item.w = rect.Width;
            item.h = rect.Height;
            item.russian = russian;
            if (!item.text.empty() && item.w > 0 && item.h > 0) out.push_back(std::move(item));
        }
    }
}

bool loadEngines() {
    if (engines.ready) return true;
    engines.russian = OcrEngine::TryCreateFromLanguage(Language(L"ru-RU"));
    engines.english = OcrEngine::TryCreateFromLanguage(Language(L"en-US"));
    engines.ready = engines.russian && engines.english;
    return engines.ready;
}

std::wstring longPath(std::wstring path) {
    if (path.rfind(L"\\\\?\\", 0) == 0) return path;
    if (path.size() >= 240 && path.size() > 2 && path[1] == L':') return L"\\\\?\\" + path;
    return path;
}

SoftwareBitmap decodeImage(const std::wstring& path, uint32_t limit) {
    IRandomAccessStream stream{ nullptr };
    check_hresult(CreateRandomAccessStreamOnFile(
        longPath(path).c_str(),
        static_cast<DWORD>(GENERIC_READ),
        guid_of<IRandomAccessStream>(),
        reinterpret_cast<void**>(put_abi(stream))));
    auto decoder = BitmapDecoder::CreateAsync(stream).get();
    uint32_t width = decoder.PixelWidth();
    uint32_t height = decoder.PixelHeight();
    if (width == 0 || height == 0) throw std::runtime_error("decode-failed");
    BitmapTransform transform;
    if (limit > 0 && (width > limit || height > limit)) {
        double scale = std::min(static_cast<double>(limit) / width, static_cast<double>(limit) / height);
        transform.ScaledWidth(std::max<uint32_t>(1, static_cast<uint32_t>(width * scale)));
        transform.ScaledHeight(std::max<uint32_t>(1, static_cast<uint32_t>(height * scale)));
    }
    auto bitmap = decoder.GetSoftwareBitmapAsync(
        BitmapPixelFormat::Bgra8,
        BitmapAlphaMode::Premultiplied,
        transform,
        ExifOrientationMode::RespectExifOrientation,
        ColorManagementMode::DoNotColorManage).get();
    if (!bitmap || bitmap.PixelWidth() == 0 || bitmap.PixelHeight() == 0) {
        throw std::runtime_error("decode-failed");
    }
    return bitmap;
}

void handleLine(const std::string& line) {
    std::optional<std::string> path;
    try {
        path = parseImagePath(line);
    } catch (...) {
        respond("error", "bad-request");
        return;
    }
    if (!path || path->empty()) {
        respond("error", "bad-request");
        return;
    }
    try {
        if (!loadEngines()) {
            respond("error", "language-missing");
            return;
        }
        uint32_t limit = OcrEngine::MaxImageDimension();
        SoftwareBitmap bitmap{ nullptr };
        try {
            bitmap = decodeImage(utf8ToWide(*path), limit);
        } catch (...) {
            respond("error", "decode-failed");
            return;
        }
        std::vector<Word> words;
        collect(engines.english, false, bitmap, words);
        collect(engines.russian, true, bitmap, words);
        respond("text", wideToUtf8(assemble(std::move(words))));
    } catch (...) {
        respond("error", "ocr-failed");
    }
}

int main() {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    init_apartment(apartment_type::multi_threaded);
    std::string buffer;
    char temp[8192];
    while (true) {
        int count = _read(_fileno(stdin), temp, sizeof(temp));
        if (count <= 0) break;
        buffer.append(temp, temp + count);
        size_t pos = 0;
        while ((pos = buffer.find('\n')) != std::string::npos) {
            std::string line = buffer.substr(0, pos);
            buffer.erase(0, pos + 1);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (!line.empty()) handleLine(line);
        }
    }
    uninit_apartment();
    return 0;
}
