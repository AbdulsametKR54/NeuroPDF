# import re
# import nltk
# import zeyrek

# # Docker içinde NLTK verileri eksikse indir
# try:
#     nltk.data.find("tokenizers/punkt")
# except LookupError:
#     nltk.download("punkt")

# print("Zeyrek (MorphAnalyzer) yükleniyor... Lütfen bekleyin.")
# analyzer = zeyrek.MorphAnalyzer()
# print("Zeyrek yüklendi!")

# def detect_unknown_words(text: str) -> list[str]:
#     if not text:
#         return []

#     words = re.findall(r"\b[a-zA-ZçÇğĞıİöÖşŞüÜ]+\b", text)

#     unknown = []
#     for word in words:
#         if len(word) < 2:
#             continue
#         results = analyzer.analyze(word.lower())
#         if not results:
#             unknown.append(word)

#     return sorted(set(unknown))