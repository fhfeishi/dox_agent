@echo off
rem ------------------------------------------------------------
rem dox_agent Windows launcher; equivalent to launch.sh
rem ------------------------------------------------------------
chcp 65001 >nul
setlocal

rem Use paths without brackets in this section: cmd parses rem lines
rem inside parenthesized blocks.
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"

rem Set PORT/HOST before the preflight: launcher.py check reads the same
rem variables, and its own fallback is 8000.
if not defined PORT set "PORT=8000"
if not defined HOST set "HOST=127.0.0.1"

rem ------------------------------------------------------------
rem Basic dependencies
rem ------------------------------------------------------------

where uv >nul 2>nul
if errorlevel 1 (
  echo Requires uv first. Install it from https://docs.astral.sh/uv/
  exit /b 1
)

rem ------------------------------------------------------------
rem Python virtual environment
rem
rem Priority:
rem   1. the active VIRTUAL_ENV
rem   2. DOX_AGENT_VENV
rem   3. .venv in the project root
rem
rem An existing environment is never rebuilt. Only a missing target
rem directory is created. This differs from launch.sh only in layout:
rem Windows environments use Scripts\python.exe.
rem ------------------------------------------------------------

set "runtime="
if defined VIRTUAL_ENV set "runtime=%VIRTUAL_ENV%"
if not defined runtime if defined DOX_AGENT_VENV set "runtime=%DOX_AGENT_VENV%"
if not defined runtime set "runtime=%PROJECT_ROOT%\.venv"

rem Normalize forward slashes and relative paths against the project root.
rem Drive-letter paths (D:\...) and UNC paths (\...) are already absolute;
rem only bare relative paths get rooted under the project.
set "runtime=%runtime:/=\%"
set "ABS_PATH="
if "%runtime:~0,1%"=="\" set "ABS_PATH=1"
if "%runtime:~1,1%"==":" set "ABS_PATH=1"
if not defined ABS_PATH set "runtime=%PROJECT_ROOT%\%runtime%"
set "ABS_PATH="

if exist "%runtime%" (
  if not exist "%runtime%\Scripts\python.exe" (
    echo The environment directory exists but has no usable Python:
    echo   %runtime%
    echo To avoid overwriting it, this launcher never rebuilds that directory.
    echo Check or delete it manually, then run this script again.
    exit /b 1
  )
) else (
  echo No virtual environment found, creating: %runtime%
  call uv venv --seed --python=3.12 "%runtime%"
  if errorlevel 1 exit /b 1
)

rem Do not add the trailing backslash that for /f would escape out of.
for %%I in ("%runtime%") do set "runtime=%%~fI"
set "python=%runtime%\Scripts\python.exe"

rem ------------------------------------------------------------
rem Python version check
rem ------------------------------------------------------------

call "%python%" -c "import sys; sys.exit('virtual environment needs Python 3.12+, current: ' + '.'.join(map(str, sys.version_info[:3]))) if sys.version_info < (3, 12) else None"
if errorlevel 1 exit /b 1

echo Using virtual environment: %runtime%
for /f "delims=" %%V in ('""%python%" --version"') do echo Python: %%V

rem ------------------------------------------------------------
rem Preflight check
rem ------------------------------------------------------------

call "%python%" src\launcher.py check
set "result=%errorlevel%"

if "%result%"=="10" (
  echo The service is already running; nothing else was started.
  exit /b 0
)
if not "%result%"=="0" exit /b %result%

rem ------------------------------------------------------------
rem Auxiliary services
rem ------------------------------------------------------------

call "%python%" src\launcher.py web
if errorlevel 1 exit /b 1

rem for /f clauses choke on parentheses in inline Python; use the exit code instead.
set "embedding_enabled=0"
"%python%" -c "from src.agent.config import get_settings; import sys; sys.exit(0 if get_settings().embedding_path.strip() else 1)"
if not errorlevel 1 set "embedding_enabled=1"

if "%embedding_enabled%"=="1" (
  call "%python%" src\launcher.py embedding
  if errorlevel 1 exit /b 1
)

rem ------------------------------------------------------------
rem Frontend
rem ------------------------------------------------------------

if not exist "frontend\dist\index.html" set "REBUILD_FRONTEND=1"

if defined REBUILD_FRONTEND (
  pushd frontend
  call npm ci
  if errorlevel 1 (popd & exit /b 1)
  call npm run build
  if errorlevel 1 (popd & exit /b 1)
  popd
)

rem ------------------------------------------------------------
rem Main service
rem ------------------------------------------------------------

echo Open http://%HOST%:%PORT%
call "%python%" -m uvicorn src.main:app --loop asyncio --host "%HOST%" --port "%PORT%"
exit /b %errorlevel%
