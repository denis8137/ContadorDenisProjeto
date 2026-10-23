@echo off
title Contar Alunos por Escola - Edital
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 goto :temPython

where py >nul 2>nul
if %errorlevel%==0 goto :temPy

echo.
echo  Python nao encontrado no computador.
echo  Instele em https://www.python.org/downloads/ (marque "Add to PATH")
echo  ou abra a pasta contar-edital com qualquer servidor local.
echo.
pause
exit /b

:temPython
start "" http://localhost:8080
echo  Site abrindo no navegador. Feche esta janela (ou deixe aberta) enquanto usar.
python -m http.server 8080
goto :fim

:temPy
start "" http://localhost:8080
echo  Site abrindo no navegador. Feche esta janela (ou deixe aberta) enquanto usar.
py -m http.server 8080
goto :fim

:fim
pause
