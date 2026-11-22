FROM golang:1.27.0 AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/codeleague ./cmd
FROM debian
WORKDIR /app
COPY --from=build /app/codeleague ./codeleague
EXPOSE 9091
CMD ["./codeleague"]