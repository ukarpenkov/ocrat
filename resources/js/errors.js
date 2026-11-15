export function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const TEXT = {
  "empty-clipboard": "В буфере нет изображения",
  "not-image": "Это не изображение",
  unreadable: "Не удалось прочитать файл",
  corrupt: "Файл повреждён",
  "ocr-failed": "Не удалось распознать текст",
  "adapter-missing": "Не найден распознаватель",
  "language-missing": "В системе нет языковых компонентов русского и английского",
  "decode-failed": "Файл повреждён",
  "bad-request": "Не удалось распознать текст",
  busy: "Распознавание уже выполняется"
};

export function message(error) {
  const code = error && error.code;
  return TEXT[code] || TEXT["ocr-failed"];
}
