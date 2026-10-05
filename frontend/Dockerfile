FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

ENV VITE_API_URL=http://api:8000

CMD ["npm", "run", "dev"]
