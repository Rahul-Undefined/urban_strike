@echo off
setlocal

title Urban Strike - Deploy

cd /d "%~dp0"

echo.
echo ==========================================
echo        URBAN STRIKE DEPLOYMENT
echo ==========================================
echo.

echo [1/5] Checking Git...
git status
if errorlevel 1 (
    echo.
    echo ERROR: Git repository not available.
    pause
    exit /b 1
)

echo.
echo [2/5] Fetching latest GitHub changes...
git fetch origin
if errorlevel 1 (
    echo.
    echo ERROR: Could not fetch from GitHub.
    pause
    exit /b 1
)

echo.
echo [3/5] Adding latest game files...
git add -A
if errorlevel 1 (
    echo.
    echo ERROR: Could not add files.
    pause
    exit /b 1
)

echo.
echo [4/5] Creating update commit...

git diff --cached --quiet

if errorlevel 1 (
    git commit -m "Latest Urban Strike game update"
    if errorlevel 1 (
        echo.
        echo ERROR: Commit failed.
        pause
        exit /b 1
    )
) else (
    echo No new file changes detected.
)

echo.
echo [5/5] Synchronizing with GitHub...

git merge -s ours origin/main -m "Sync remote with latest local game update"
if errorlevel 1 (
    echo.
    echo ERROR: GitHub synchronization failed.
    echo.
    echo DO NOT FORCE PUSH.
    pause
    exit /b 1
)

echo.
echo Pushing to GitHub...

git push origin main
if errorlevel 1 (
    echo.
    echo ==========================================
    echo          DEPLOYMENT FAILED
    echo ==========================================
    echo.
    echo GitHub rejected the push.
    echo No deployment was started.
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo       DEPLOYMENT STARTED SUCCESSFULLY
echo ==========================================
echo.
echo GitHub has accepted the latest game.
echo Render will deploy automatically.
echo.

pause