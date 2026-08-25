#!/usr/bin/env bash
set -euo pipefail

DO_BUILD=0
DO_RUN=1
USE_CI=0
INSTALL_SYSTEM_DEPS=0
SETUP_WHISPER=1
WHISPER_MODEL="${WHISPER_MODEL:-base}"
WHISPER_LANGUAGE="${WHISPER_LANGUAGE:-en}"
WHISPER_SEGMENT_MS="${WHISPER_SEGMENT_MS:-4000}"
WHISPER_BATCH_SIZE="${WHISPER_BATCH_SIZE:-4}"
WHISPER_BATCH_TIMEOUT_MS="${WHISPER_BATCH_TIMEOUT_MS:-2000}"
WHISPER_MAX_CONCURRENT="${WHISPER_MAX_CONCURRENT:-4}"
WHISPER_BEAM_SIZE="${WHISPER_BEAM_SIZE:-5}"
WHISPER_ENGINE="${WHISPER_ENGINE:-whisper-cpp}"
WHISPER_FASTER_DEVICE="${WHISPER_FASTER_DEVICE:-}"
WHISPER_FASTER_COMPUTE_TYPE="${WHISPER_FASTER_COMPUTE_TYPE:-}"
WHISPER_CPP_COMMAND="${WHISPER_CPP_COMMAND:-}"
WHISPER_CPP_PYTHON="${WHISPER_CPP_PYTHON:-}"
WHISPER_CPP_THREADS="${WHISPER_CPP_THREADS:-4}"
WHISPER_CPP_BLAS="${WHISPER_CPP_BLAS:-auto}"
WHISPER_CPP_BACKEND="${WHISPER_CPP_BACKEND:-vulkan}"
WHISPER_CPP_MODEL_DIR="${WHISPER_CPP_MODEL_DIR:-.whisper-cpp-models}"
WHISPER_CPP_MODEL="${WHISPER_CPP_MODEL:-}"
WHISPER_VENV_DIR=".venv-whisper"
WHISPER_FASTER_VENV_DIR=".venv-faster-whisper"
WHISPER_MODEL_DIR=".whisper-models"
WHISPER_FASTER_MODEL_DIR=".faster-whisper-models"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_NAME="unknown"
PLATFORM_BUILD_SCRIPT="build"
PYTHON_BIN="python3"
WHISPER_PIP_PATH=""
WHISPER_COMMAND_PATH=""

print_header() {
  echo "========================================"
  echo " OpenCluely Setup"
  echo "========================================"
}

usage() {
  cat <<EOF
Usage: ./setup.sh [options]

This script will:
1. Create .env from env.example when needed
2. Install Node dependencies
3. Optionally set up local Whisper in ${WHISPER_VENV_DIR}
4. Optionally install system audio dependencies
5. Optionally build the app
6. Optionally run OpenCluely

Options:
  --build                 Build a distributable for this OS
  --no-run                Do not start the app after setup
  --run                   Start the app after setup (default)
  --ci                    Use 'npm ci' instead of 'npm install'
  --install-system-deps   Attempt to install sox where possible
  --skip-whisper          Skip local Whisper environment setup
  -h, --help              Show this help

Environment variables:
  GEMINI_API_KEY          If provided, writes into .env
  WHISPER_MODEL           Whisper model to configure (default: turbo)
  WHISPER_LANGUAGE        Whisper language to configure (default: en)
  WHISPER_SEGMENT_MS      Segment size in ms (default: 4000)
  WHISPER_ENGINE          Whisper engine selector: whisper-cpp|faster|openai (default: whisper-cpp)
  WHISPER_CPP_COMMAND     whisper-cli binary path (default: auto-detected or built)
  WHISPER_CPP_THREADS     whisper.cpp CPU threads (default: 4)
  WHISPER_CPP_BLAS        OpenBLAS mode: auto|true|false (default: auto)
  WHISPER_CPP_BACKEND     whisper.cpp backend: vulkan|cpu|auto (default: vulkan)
  WHISPER_FASTER_DEVICE   Faster Whisper device (default: auto-detected)
  WHISPER_FASTER_COMPUTE_TYPE Faster Whisper compute type (default: auto-detected)
  WHISPER_BATCH_SIZE      Faster Whisper segments per batch (default: 4)
  WHISPER_BATCH_TIMEOUT_MS Partial batch timeout in ms (default: 2000)
  WHISPER_MAX_CONCURRENT  Faster Whisper worker concurrency (default: 4)
  WHISPER_BEAM_SIZE       Faster Whisper beam size (default: 5)

Example:
  GEMINI_API_KEY=your_key_here ./setup.sh --install-system-deps
EOF
}

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --no-run) DO_RUN=0 ;;
    --run) DO_RUN=1 ;;
    --ci) USE_CI=1 ;;
    --install-system-deps) INSTALL_SYSTEM_DEPS=1 ;;
    --skip-whisper) SETUP_WHISPER=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

print_header
cd "$SCRIPT_DIR"

detect_os() {
  local uname_out
  uname_out=$(uname -s || echo "unknown")
  case "$uname_out" in
    Linux*) OS_NAME="linux" ;;
    Darwin*) OS_NAME="macos" ;;
    CYGWIN*|MINGW*|MSYS*) OS_NAME="windows" ;;
    *) OS_NAME="unknown" ;;
  esac

  case "$OS_NAME" in
    macos) PLATFORM_BUILD_SCRIPT="build:mac" ;;
    windows) PLATFORM_BUILD_SCRIPT="build:win" ;;
    linux) PLATFORM_BUILD_SCRIPT="build:linux" ;;
    *) PLATFORM_BUILD_SCRIPT="build" ;;
  esac

  case "$OS_NAME" in
    windows)
      PYTHON_BIN="python"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/Scripts/pip.exe"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/Scripts/whisper.exe"
      ;;
    *)
      PYTHON_BIN="python3"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/bin/pip"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/bin/whisper"
      ;;
  esac
}

require_command() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: ${message}"
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    if [[ -f env.example ]]; then
      echo "Creating .env from env.example"
      cp env.example .env
    else
      echo "Error: env.example is missing"
      exit 1
    fi
  fi

  if ! grep -q '^WHISPER_ENGINE=' .env 2>/dev/null; then
    echo "WHISPER_ENGINE=${WHISPER_ENGINE}" >> .env
  fi
  if ! grep -q '^WHISPER_FASTER_DEVICE=' .env 2>/dev/null; then
    echo "WHISPER_FASTER_DEVICE=${WHISPER_FASTER_DEVICE:-cpu}" >> .env
  fi
  if ! grep -q '^WHISPER_FASTER_COMPUTE_TYPE=' .env 2>/dev/null; then
    echo "WHISPER_FASTER_COMPUTE_TYPE=${WHISPER_FASTER_COMPUTE_TYPE:-int8}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_COMMAND=' .env 2>/dev/null; then
    echo "WHISPER_CPP_COMMAND=${WHISPER_CPP_COMMAND}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_PYTHON=' .env 2>/dev/null; then
    echo "WHISPER_CPP_PYTHON=${WHISPER_CPP_PYTHON}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_THREADS=' .env 2>/dev/null; then
    echo "WHISPER_CPP_THREADS=${WHISPER_CPP_THREADS}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_BLAS=' .env 2>/dev/null; then
    echo "WHISPER_CPP_BLAS=${WHISPER_CPP_BLAS}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_BACKEND=' .env 2>/dev/null; then
    echo "WHISPER_CPP_BACKEND=${WHISPER_CPP_BACKEND}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_MODEL_DIR=' .env 2>/dev/null; then
    echo "WHISPER_CPP_MODEL_DIR=${WHISPER_CPP_MODEL_DIR}" >> .env
  fi
  if ! grep -q '^WHISPER_CPP_MODEL=' .env 2>/dev/null; then
    echo "WHISPER_CPP_MODEL=${WHISPER_CPP_MODEL}" >> .env
  fi
  if ! grep -q '^WHISPER_BATCH_SIZE=' .env 2>/dev/null; then
    echo "WHISPER_BATCH_SIZE=${WHISPER_BATCH_SIZE}" >> .env
  fi
  if ! grep -q '^WHISPER_BATCH_TIMEOUT_MS=' .env 2>/dev/null; then
    echo "WHISPER_BATCH_TIMEOUT_MS=${WHISPER_BATCH_TIMEOUT_MS}" >> .env
  fi
  if ! grep -q '^WHISPER_MAX_CONCURRENT=' .env 2>/dev/null; then
    echo "WHISPER_MAX_CONCURRENT=${WHISPER_MAX_CONCURRENT}" >> .env
  fi
  if ! grep -q '^WHISPER_BEAM_SIZE=' .env 2>/dev/null; then
    echo "WHISPER_BEAM_SIZE=${WHISPER_BEAM_SIZE}" >> .env
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env 2>/dev/null; then
    KEY="$key" VALUE="$value" perl -0pi -e 'my $key = $ENV{KEY}; my $value = $ENV{VALUE}; my $pattern = quotemeta($key); s/^$pattern=.*$/$key . "=" . $value/mge' .env
  else
    printf "%s=%s\n" "$key" "$value" >> .env
  fi
}

ensure_gemini_key() {
  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    upsert_env "GEMINI_API_KEY" "$GEMINI_API_KEY"
  fi

  # GEMINI_API_KEY is now OPTIONAL during setup. The app's first-run
  # flow will auto-open the Settings window if the key is missing and
  # guide the user to enter it. Hard-blocking at install time makes
  # CI / packaging / scripted installs harder for no real benefit.

  if ! grep -q '^GEMINI_API_KEY=' .env 2>/dev/null; then
    # Make sure the key exists in .env even if unset — the app reads
    # this on first-run to know whether onboarding is needed.
    echo "GEMINI_API_KEY=your_gemini_api_key_here" >> .env
  fi

  if grep -q 'your_gemini_api_key_here' .env 2>/dev/null; then
    echo ""
    echo "=========================================="
    echo " No Gemini API key detected"
    echo "=========================================="
    echo ""
    echo "The app will start, but AI features won't work until you set"
    echo "GEMINI_API_KEY in .env (or via the Settings window on first launch)."
    echo ""
    echo "Get a free key from: https://aistudio.google.com/"
    echo ""
    echo "Setup will continue without blocking."
    echo ""
  fi
}

install_system_deps() {
  if [[ "$INSTALL_SYSTEM_DEPS" -ne 1 ]]; then
    return
  fi

  echo "Attempting to install system audio dependencies"

  if command -v sox >/dev/null 2>&1; then
    echo "sox already installed"
    return
  fi

  case "$OS_NAME" in
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install sox || echo "Could not install sox automatically. Install it manually with: brew install sox"
      else
        echo "Homebrew not found. Install sox manually."
      fi
      ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y sox || echo "Could not install sox via apt-get"
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y sox || echo "Could not install sox via dnf"
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm sox || echo "Could not install sox via pacman"
      else
        echo "Unknown package manager. Install sox manually."
      fi
      ;;
    windows)
      echo "Install sox manually on Windows, for example via Chocolatey: choco install sox"
      ;;
    *)
      echo "Unknown OS. Install sox manually if you want microphone capture."
      ;;
  esac
}

install_node_deps() {
  if [[ -f package-lock.json && "$USE_CI" -eq 1 ]]; then
    echo "Installing Node dependencies with npm ci"
    npm ci
  else
    echo "Installing Node dependencies with npm install"
    npm install
  fi
}

detect_faster_gpu() {
  local gpu_json
  local gpu_info
  local gpu_device
  local gpu_name

  gpu_json=$("$PYTHON_BIN" scripts/detect-gpu.py 2>/dev/null || true)
  gpu_info=$("$PYTHON_BIN" -c 'import json,sys; p=json.loads(sys.stdin.read()); print("{}|{}".format(p.get("device","cpu"),p.get("gpuName","")))' <<<"$gpu_json" 2>/dev/null || true)
  gpu_device="${gpu_info%%|*}"
  gpu_name="${gpu_info#*|}"
  gpu_device="${gpu_device:-cpu}"

  case "$gpu_device" in
    cuda)
      [[ -n "$WHISPER_FASTER_DEVICE" ]] || WHISPER_FASTER_DEVICE="cuda"
      [[ -n "$WHISPER_FASTER_COMPUTE_TYPE" ]] || WHISPER_FASTER_COMPUTE_TYPE="float16"
      echo "Detected GPU: ${gpu_name:-NVIDIA GPU}. Using device=${WHISPER_FASTER_DEVICE}, compute_type=${WHISPER_FASTER_COMPUTE_TYPE}"
      ;;
    rocm)
      echo "Detected GPU: ${gpu_name:-AMD GPU}. ROCm support requires manual wheel installation."
      [[ -n "$WHISPER_FASTER_DEVICE" ]] || WHISPER_FASTER_DEVICE="cpu"
      [[ -n "$WHISPER_FASTER_COMPUTE_TYPE" ]] || WHISPER_FASTER_COMPUTE_TYPE="int8"
      echo "Using safe fallback: device=${WHISPER_FASTER_DEVICE}, compute_type=${WHISPER_FASTER_COMPUTE_TYPE}"
      ;;
    *)
      [[ -n "$WHISPER_FASTER_DEVICE" ]] || WHISPER_FASTER_DEVICE="cpu"
      [[ -n "$WHISPER_FASTER_COMPUTE_TYPE" ]] || WHISPER_FASTER_COMPUTE_TYPE="int8"
      echo "No supported GPU detected. Using device=${WHISPER_FASTER_DEVICE}, compute_type=${WHISPER_FASTER_COMPUTE_TYPE}"
      ;;
  esac

  GPU_DETECTED_DEVICE="$gpu_device"
}

setup_whisper_cpp_env() {
  if [[ "$SETUP_WHISPER" -ne 1 ]]; then
    echo "Skipping whisper.cpp setup"
    return
  fi

  require_command "$PYTHON_BIN" "Python 3 is required for whisper.cpp setup."
  local cpu_json
  local cpu_summary
  cpu_json=$("$PYTHON_BIN" scripts/detect-cpu.py 2>/dev/null || true)
  cpu_summary=$("$PYTHON_BIN" -c 'import json,sys; p=json.loads(sys.stdin.read() or "{}"); print("{}|{}|{}|{}".format(p.get("vendor","unknown"),p.get("has_avx2",False),p.get("has_avx512",False),p.get("blas_available",False)))' <<<"$cpu_json" 2>/dev/null || true)
  echo "Detected CPU: ${cpu_summary:-unknown}"
  local cpu_blas="${cpu_summary##*|}"
  if [[ "$WHISPER_CPP_BLAS" == "auto" && "$cpu_blas" == "True" ]]; then
    WHISPER_CPP_BLAS="true"
  fi
  local gpu_json
  local gpu_summary
  gpu_json=$("$PYTHON_BIN" scripts/detect-gpu.py 2>/dev/null || true)
  gpu_summary=$("$PYTHON_BIN" -c 'import json,sys; p=json.loads(sys.stdin.read() or "{}"); print("{}|{}|{}".format(p.get("gpuName",""),p.get("vulkan",False),p.get("vulkanGpuName",""))) ' <<<"$gpu_json" 2>/dev/null || true)
  local gpu_name="${gpu_summary%%|*}"
  local gpu_vulkan="${gpu_summary#*|}"
  gpu_vulkan="${gpu_vulkan%%|*}"
  local vulkan_gpu_name="${gpu_summary##*|}"
  if [[ "$gpu_vulkan" == "True" ]]; then
    echo "Detected Vulkan GPU: ${vulkan_gpu_name:-${gpu_name:-GPU}}"
  else
    echo "Vulkan runtime not detected; whisper.cpp will use CPU"
    if [[ "$WHISPER_CPP_BACKEND" == "vulkan" ]]; then
      WHISPER_CPP_BACKEND="cpu"
    fi
  fi
  if [[ "$WHISPER_CPP_BACKEND" == "auto" ]]; then
    if [[ "$gpu_vulkan" == "True" ]]; then WHISPER_CPP_BACKEND="vulkan"; else WHISPER_CPP_BACKEND="cpu"; fi
  fi


  if [[ ! -d ".venv-whisper-cpp" ]]; then
    echo "Creating whisper.cpp worker virtual environment at .venv-whisper-cpp"
    "$PYTHON_BIN" -m venv .venv-whisper-cpp || {
      echo "WARNING: Could not create .venv-whisper-cpp"
      return
    }
  fi
  if [[ "$OS_NAME" == "windows" ]]; then
    WHISPER_CPP_PYTHON=".venv-whisper-cpp/Scripts/python.exe"
  else
    WHISPER_CPP_PYTHON=".venv-whisper-cpp/bin/python"
  fi

  local binary="${WHISPER_CPP_COMMAND:-}"
  if [[ -z "$binary" ]] && command -v whisper-cli >/dev/null 2>&1; then
    binary=$(command -v whisper-cli)
  fi
  if [[ -z "$binary" ]] && command -v main >/dev/null 2>&1; then
    binary=$(command -v main)
  fi

  local source_dir=".whisper.cpp"
  local build_dir="${source_dir}/build"
  if [[ -z "$binary" && -x "$(command -v git 2>/dev/null || true)" && -x "$(command -v cmake 2>/dev/null || true)" ]]; then
    if [[ ! -f "${source_dir}/CMakeLists.txt" ]]; then
      echo "Cloning whisper.cpp into ${source_dir}"
      git clone --branch v1.9.1 --depth 1 https://github.com/ggml-org/whisper.cpp.git "$source_dir" || {
        echo "WARNING: Could not clone whisper.cpp"
        return
      }
    fi
    local cmake_args=("-S" "$source_dir" "-B" "$build_dir" "-DCMAKE_BUILD_TYPE=Release")
    if [[ "$WHISPER_CPP_BACKEND" == "vulkan" ]]; then
      cmake_args+=("-DGGML_VULKAN=ON")
      echo "Configuring whisper.cpp v1.9.1 with Vulkan"
    else
      cmake_args+=("-DGGML_VULKAN=OFF")
    fi
    if [[ "$WHISPER_CPP_BLAS" == "true" ]]; then
      cmake_args+=("-DGGML_BLAS=ON" "-DGGML_BLAS_VENDOR=OpenBLAS")
      echo "Configuring whisper.cpp with OpenBLAS"
    fi
    cmake "${cmake_args[@]}" || {
      echo "WARNING: CMake configuration failed for whisper.cpp"
      return
    }
    cmake --build "$build_dir" --config Release || {
      echo "WARNING: whisper.cpp build failed"
      return
    }
    for candidate in \
      "${source_dir}/build/bin/whisper-cli" \
      "${source_dir}/build/bin/whisper-cli.exe" \
      "${source_dir}/build/bin/Release/whisper-cli.exe" \
      "${source_dir}/build/Release/whisper-cli.exe"; do
      if [[ -f "$candidate" ]]; then
        binary="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$binary" ]]; then
    echo "WARNING: whisper-cli not found. Set WHISPER_CPP_COMMAND or install git + CMake and rerun setup."
  else
    echo "whisper.cpp binary: $binary"
  fi

  mkdir -p "${WHISPER_CPP_MODEL_DIR}"
  upsert_env "SPEECH_PROVIDER" "whisper"
  upsert_env "WHISPER_ENGINE" "whisper-cpp"
  upsert_env "WHISPER_COMMAND" ""
  upsert_env "WHISPER_CPP_COMMAND" "$binary"
  upsert_env "WHISPER_CPP_PYTHON" "$WHISPER_CPP_PYTHON"
  upsert_env "WHISPER_CPP_THREADS" "$WHISPER_CPP_THREADS"
  upsert_env "WHISPER_CPP_BLAS" "$WHISPER_CPP_BLAS"
  upsert_env "WHISPER_CPP_BACKEND" "$WHISPER_CPP_BACKEND"
  upsert_env "WHISPER_CPP_MODEL_DIR" "$WHISPER_CPP_MODEL_DIR"
  upsert_env "WHISPER_CPP_MODEL" "$WHISPER_CPP_MODEL"
}
setup_whisper_env() {
  if [[ "$SETUP_WHISPER" -ne 1 ]]; then
    echo "Skipping local Whisper setup"
    return
  fi

  if [[ "$WHISPER_ENGINE" == "whisper-cpp" || "$WHISPER_ENGINE" == "cpp" ]]; then
    setup_whisper_cpp_env
    return
  fi

  if [[ "$WHISPER_ENGINE" != "faster" ]]; then
    echo "WHISPER_ENGINE=openai; skipping local GPU setup"
    return
  fi

  # Skip whisper setup when only building (build distributions don't need local whisper)
  if [[ "$DO_BUILD" -eq 1 && "$DO_RUN" -eq 0 ]]; then
    echo "Skipping local Whisper setup (build-only mode)"
    return
  fi

  require_command "$PYTHON_BIN" "Python 3 is required for local Whisper setup."

  if [[ "$OS_NAME" == "windows" ]]; then
    case "$(uname -m)" in
      x86_64|amd64) ;;
      i?86) echo "Faster Whisper is not supported on Windows ia32. Use x64 or set WHISPER_ENGINE=openai."; exit 1 ;;
    esac
  fi

  if [[ ! -d "$WHISPER_FASTER_VENV_DIR" ]]; then
    echo "Creating Faster Whisper virtual environment at $WHISPER_FASTER_VENV_DIR"
    "$PYTHON_BIN" -m venv "$WHISPER_FASTER_VENV_DIR"
  fi

  if [[ "$OS_NAME" == "windows" ]]; then WHISPER_PIP_PATH="${WHISPER_FASTER_VENV_DIR}/Scripts/pip.exe"; else WHISPER_PIP_PATH="${WHISPER_FASTER_VENV_DIR}/bin/pip"; fi

  detect_faster_gpu

  echo "Installing faster-whisper into $WHISPER_FASTER_VENV_DIR"
  "$WHISPER_PIP_PATH" install --upgrade pip || true
  "$WHISPER_PIP_PATH" install faster-whisper || {
    echo "WARNING: pip install faster-whisper failed. Faster Whisper may be unavailable."
    echo "Common causes: insufficient disk space, missing Python headers, or network issues."
  }

  if [[ "$GPU_DETECTED_DEVICE" == "cuda" || "$WHISPER_FASTER_DEVICE" == "cuda" ]]; then
    echo "Installing CUDA runtime packages for Faster Whisper"
    "$WHISPER_PIP_PATH" install nvidia-cublas-cu12 nvidia-cudnn-cu12 || {
      echo "WARNING: CUDA runtime packages could not be installed. The CPU fallback may be required."
    }
  fi

  mkdir -p "$WHISPER_FASTER_MODEL_DIR"

  # Verify the Whisper CLI actually exists before claiming it's configured
  local whisper_found=0
  if [[ -f "$WHISPER_FASTER_VENV_DIR/bin/python" || -f "$WHISPER_FASTER_VENV_DIR/Scripts/python.exe" ]]; then
    echo "Faster Whisper venv ready at: $WHISPER_FASTER_VENV_DIR"
    whisper_found=1
  else
    echo "WARNING: Faster Whisper venv not ready"
    echo "Speech recognition will be unavailable until Faster Whisper is properly installed."
  fi

  upsert_env "SPEECH_PROVIDER" "whisper"
  upsert_env "WHISPER_ENGINE" "faster"
  upsert_env "AZURE_SPEECH_KEY" ""
  upsert_env "AZURE_SPEECH_REGION" ""
  upsert_env "WHISPER_COMMAND" ""
  upsert_env "WHISPER_MODEL_DIR" "${WHISPER_FASTER_MODEL_DIR}"
  upsert_env "WHISPER_MODEL" "${WHISPER_MODEL}"
  upsert_env "WHISPER_LANGUAGE" "${WHISPER_LANGUAGE}"
  upsert_env "WHISPER_SEGMENT_MS" "${WHISPER_SEGMENT_MS}"
  upsert_env "WHISPER_FASTER_DEVICE" "${WHISPER_FASTER_DEVICE}"
  upsert_env "WHISPER_FASTER_COMPUTE_TYPE" "${WHISPER_FASTER_COMPUTE_TYPE}"
  upsert_env "WHISPER_BATCH_SIZE" "${WHISPER_BATCH_SIZE}"
  upsert_env "WHISPER_BATCH_TIMEOUT_MS" "${WHISPER_BATCH_TIMEOUT_MS}"
  upsert_env "WHISPER_MAX_CONCURRENT" "${WHISPER_MAX_CONCURRENT}"
  upsert_env "WHISPER_BEAM_SIZE" "${WHISPER_BEAM_SIZE}"

  if [[ "$whisper_found" -eq 1 ]]; then
    echo "Running Whisper smoke test"
    npm run test-speech
  else
    echo "Skipping Whisper smoke test (CLI not found)"
  fi
}

build_app() {
  if [[ "$DO_BUILD" -eq 1 ]]; then
    echo "Building app for $OS_NAME with npm run $PLATFORM_BUILD_SCRIPT"
    npm run "$PLATFORM_BUILD_SCRIPT"
  fi
}

run_app() {
  if [[ "$DO_RUN" -eq 1 ]]; then
    echo "Starting app"
    npm start
  else
    echo "Setup complete. Skipping run."
  fi
}

detect_os
echo "Detected OS: $OS_NAME"
require_command node "Node.js 18+ is required."
require_command npm "npm is required."
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

ensure_env_file
ensure_gemini_key
install_system_deps
install_node_deps
setup_whisper_env
build_app
run_app
