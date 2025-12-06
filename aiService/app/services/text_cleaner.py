import zeyrek
import re
import nltk # nltk kütüphanesini ekle


# Docker içinde NLTK verileri eksikse indir
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    print("NLTK verileri indiriliyor...")
    nltk.download('punkt_tab')
    nltk.download('punkt')


# Analizörü global olarak başlatıyoruz (Sadece uygulama açılırken 1 kere yüklenir, hız kazandırır)
print("Zeyrek (MorphAnalyzer) yükleniyor... Lütfen bekleyin.")
analyzer = zeyrek.MorphAnalyzer()
print("Zeyrek yüklendi!")

def detect_unknown_words(text: str) -> list:
    """
    Metindeki kelimeleri tarar. Zeyrek'in analiz edemediği (Sözlükte bulamadığı)
    kelimeleri 'şüpheli' olarak listeler.
    """
    if not text:
        return []

    # Noktalama işaretlerini temizle ve kelimelere böl
    # Sadece harflerden oluşan kelimeleri alıyoruz
    words = re.findall(r'\b[a-zA-ZçÇğĞıİöÖşŞüÜ]+\b', text)
    
    unknown_words = []
    
    for word in words:
        # Kelime çok kısaysa (1-2 harf) atla (ve, bu, şu vb. hatalı çıkmasın)
        if len(word) < 2:
            continue
            
        # Zeyrek analizi
        results = analyzer.analyze(word.lower())
        
        # Eğer Zeyrek hiçbir kök/ek bulamadıysa, bu kelime muhtemelen hatalıdır
        if not results:
            unknown_words.append(word)
            
    # Tekrarlanan kelimeleri temizle (set)
    return list(set(unknown_words))

# Test Bloğu
if __name__ == "__main__":
    test_text = "Bugün hava cok guzel ama arabayı park etcek yer yok."
    print("Şüpheliler:", detect_unknown_words(test_text))