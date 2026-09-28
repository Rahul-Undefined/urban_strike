@echo off
title Urban Strike Deployment Tool
color 0A

echo ==========================================
echo         Urban Strike Deployment
echo ==========================================
echo.

cd /d C:\Users\RahulOjha\Documents\urban_strike

echo Checking Git status...
git status

echo.
set /p msg=Enter Commit Message: 

echo.
echo Adding files...
git add .

echo.
echo Committing...
git commit -m "%msg%"

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo Opening GitHub...
start https://github.com

echo Opening Render Dashboard...
start https://dashboard.render.com

echo.
echo ==========================================
echo Deployment Started Successfully
echo Render will deploy automatically.
echo ==========================================
pause