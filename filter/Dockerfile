FROM golang:1.22-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /filter .

FROM scratch
COPY --from=build /filter /filter
ENTRYPOINT ["/filter"]
