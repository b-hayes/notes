FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache fzf nano

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
