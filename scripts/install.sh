  #!/bin/bash

  set -e

  REPO="travisvnn/gptree"
  APP="GPTree"
  ARCH=$(uname -m)
  OS=$(uname -s)

  LATEST_JSON=$(curl -s https://api.github.com/repos/$REPO/releases/latest)

  get_download_url() {
    echo "$LATEST_JSON" | grep "browser_download_url" | grep "$1" | cut -d '"' -f 4
  }

  get_deb() {
    URL=$(get_download_url ".deb")
    if [ -z "$URL" ]; then echo "❌ .deb package not found in latest release."; exit 1; fi
    echo "Downloading .deb package..."
    curl -LO "$URL"
    sudo dpkg -i "$(basename "$URL")" || sudo apt-get install -f -y
  }

  get_rpm() {
    URL=$(get_download_url ".rpm")
    if [ -z "$URL" ]; then echo "❌ .rpm package not found in latest release."; exit 1; fi
    echo "Downloading .rpm package..."
    curl -LO "$URL"
    sudo dnf install -y "$(basename "$URL")" || sudo yum install -y "$(basename "$URL")"
  }

  get_appimage() {
    URL=$(get_download_url ".AppImage")
    if [ -z "$URL" ]; then echo "❌ .AppImage not found in latest release."; exit 1; fi
    echo "Downloading AppImage..."
    curl -LO "$URL"
    chmod +x "$(basename "$URL")"
    sudo mv "$(basename "$URL")" /usr/local/bin/gptree
    echo "Installed GPTree to /usr/local/bin/gptree"
  }

  detect_and_install() {
    echo "📦 Installing $APP for $ARCH on $OS..."

    if [[ "$OS" != "Linux" ]]; then
      echo "❌ This installer only supports Linux. Please download manually for macOS or Windows."
      exit 1
    fi

    if command -v apt-get >/dev/null 2>&1; then
      get_deb
    elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
      get_rpm
    else
      get_appimage
    fi

    echo "✅ $APP installed successfully!"
  }

  detect_and_install
  EOF
' > scripts/install.sh
