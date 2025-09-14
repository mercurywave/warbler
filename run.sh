CERT_DIR=/certs
CERT_PATH="$CERT_DIR/cert.pem"
KEY_PATH="$CERT_DIR/key.pem"

mkdir -p "$CERT_DIR"

# Check if cert exists and is still valid
if [ ! -f "$CERT_PATH" ] || ! openssl x509 -checkend $((30*24*60*60)) -noout -in "$CERT_PATH"; then
  echo "Generating new self-signed certificate..."
  openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$KEY_PATH" -out "$CERT_PATH" -days 365 \
    -subj "/CN=localhost"
else
  echo "Existing certificate is still valid."
fi

node server.js