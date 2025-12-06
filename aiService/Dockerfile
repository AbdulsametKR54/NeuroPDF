# Temiz bir Python 3.10 imajı ile başla
FROM python:3.13.2-slim

# Zemberek'in çalışması için Java (JRE) KURULUMU
RUN apt-get update && apt-get install -y default-jre && apt-get clean

# Çalışma dizinini ayarla
WORKDIR /app

# Önce bağımlılıkları kopyala ve kur (Docker katman önbelleğinden faydalanmak için)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulamanın geri kalan kodunu kopyala
COPY . .

# (Not: 'command' docker-compose.yml dosyasında belirtildiği için burada CMD'ye gerek yok)