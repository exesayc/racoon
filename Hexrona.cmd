@echo off
REM Hexrona: sunucuyu ve launcher'i birlikte baslatir. Cift tiklaman yeterli.
cd /d "%~dp0"
if not exist "node_modules" call npm.cmd install
if not exist "server\node_modules" (
  pushd server
  call npm.cmd install
  popd
)
call npm.cmd run start:all
