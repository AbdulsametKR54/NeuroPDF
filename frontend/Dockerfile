# pdf_project_monorepo/frontend/Dockerfile
# 
# Bu, Geliştirme (Development) için optimize edilmiş bir Dockerfile'dır.

# 1. Temel imaj olarak Node.js 18 (veya projenizin sürümü) kullanın
FROM node:22.14-alpine

# 2. Çalışma dizinini /app olarak ayarla
WORKDIR /app

# 3. Bağımlılıkları kur
# Sadece package.json'ı kopyala ki her kod değişiminde npm install tekrar çalışmasın
COPY package.json package-lock.json* ./
RUN npm install

# 4. Kodun geri kalanını kopyala
# (Bu, docker-compose'daki volume ile üzerine yazılacak,
#  ancak ilk kurulum için iyidir)
COPY . .

# 5. Next.js portunu (3000) dışarı aç
EXPOSE 3000

# 6. Geliştirme sunucusunu çalıştır
CMD ["npm", "run", "dev"]