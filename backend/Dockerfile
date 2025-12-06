# Adım 1: Temel İmaj Seçimi
# Python backend için 3.11 slim tabanlı imaj
FROM python:3.13.2-slim

# Adım 2: Çalışma dizini
WORKDIR /app

# Adım 3: Gereksinimleri kopyala ve yükle
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Adım 4: Uygulama kodunu kopyala
COPY . .

# Adım 5: Backend portunu aç (FastAPI için örnek 8000)
EXPOSE 8000

# Adım 6: Sunucuyu başlat
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
