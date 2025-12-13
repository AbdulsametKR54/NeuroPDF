FROM node:22.14-alpine

WORKDIR /app

# (opsiyonel) daha az gürültü + daha hızlı
ENV CI=true

# 1) Sadece dependency manifestleri
COPY package.json package-lock.json* ./

# 2) Deterministik kurulum (lockfile varsa)
RUN npm ci

# 3) Kod bind-mount ile gelecek, bu yüzden COPY . . yok

EXPOSE 3000

# Next dev server container dışından erişsin
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]
