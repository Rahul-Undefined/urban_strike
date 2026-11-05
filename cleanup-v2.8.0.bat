@echo off
REM UrbanStrike v2.8.0 - remove the six maps that v2.8.0 deleted.
REM Unzipping a release over the folder adds and replaces files but cannot
REM delete them, so run this ONCE from the urban_strike folder, then commit.
cd /d "%~dp0"
for %%F in (
  "public\src\environment\sunsetrow.js"
  "public\src\environment\smallmaps.js"
  "public\src\environment\medium.js"
  "public\src\config\maps-sunsetrow.config.js"
  "public\src\config\maps-small.config.js"
  "public\src\config\maps-medium.config.js"
) do (
  if exist %%F ( del %%F && echo removed %%F ) else ( echo already gone %%F )
)
echo.
echo Done. Commit the deletions with the rest of v2.8.0.
pause
