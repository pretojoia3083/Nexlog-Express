@echo off
cd /d "%~dp0"

echo ====================================
echo  Enviando Nexlog para o GitHub...
echo ====================================

git init
git add .
git commit -m "Initial commit - Nexlog Express"

echo.
echo Agora crie um repositorio no GitHub:
echo 1. Acesse https://github.com/new
echo 2. Nome: nexlog
echo 3. Nao marque nada (README, .gitignore, license)
echo 4. Clique em "Create repository"
echo.
echo Depois de criar, cole o comando abaixo:
echo   git remote add origin https://github.com/pretojoia3083/nexlog.git
echo   git branch -M main
echo   git push -u origin main
echo.
echo ====================================
echo  DEPOIS DO PUSH:
echo  5. Acesse https://vercel.com
echo  6. "Add New" > "Project"
echo  7. Importe nexlog
echo  8. Click "Deploy"
echo ====================================

pause
