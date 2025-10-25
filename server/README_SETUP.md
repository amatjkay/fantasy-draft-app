# 🔧 Server Setup Instructions

## Environment Variables

Для запуска сервера необходимо настроить переменные окружения.

### 1. Создайте `.env` файл

```bash
cd server
cp .env.example .env
```

### 2. Настройте переменные

Отредактируйте `server/.env` файл:

```env
# Server Configuration
NODE_ENV=development
PORT=3001

# Session Secret (ОБЯЗАТЕЛЬНО измените!)
SESSION_SECRET=ваш-супер-секретный-ключ-минимум-64-символа

# Admin Account (ОБЯЗАТЕЛЬНО измените!)
ADMIN_LOGIN=ваш_логин_админа
ADMIN_PASSWORD=ваш_надёжный_пароль

# Database Configuration
USE_SQLITE=1
DB_FILE=./data/draft.db

# Draft Timer (seconds)
TIMER_SEC=60
```

### 3. Важные замечания по безопасности

⚠️ **НИКОГДА не коммитьте `.env` файл в Git!**

✅ `.env` уже добавлен в `.gitignore`
✅ Используйте `.env.example` как шаблон без реальных данных
✅ Для production используйте надежные пароли (минимум 16 символов)

### 4. Генерация безопасных секретов

#### Session Secret (64+ символов):
```bash
# Linux/Mac
openssl rand -base64 64

# Windows (PowerShell)
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

#### Пароль Админа:
Используйте менеджер паролей для генерации надежного пароля.

---

## 🚀 Запуск

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## 🔐 Production Checklist

- [ ] Создан `.env` файл с уникальными значениями
- [ ] `SESSION_SECRET` — случайная строка 64+ символов
- [ ] `ADMIN_PASSWORD` — надежный пароль 16+ символов
- [ ] `.env` НЕ добавлен в Git
- [ ] Для production используется `NODE_ENV=production`
- [ ] Настроен backup базы данных

---

## ❓ FAQ

**Q: Что будет если не установить `ADMIN_PASSWORD`?**  
A: Сервер запустится, но дефолтный админ НЕ будет создан. Первый зарегистрированный пользователь станет админом.

**Q: Можно ли изменить логин админа?**  
A: Да, через `ADMIN_LOGIN` в `.env`. По умолчанию используется `s3ifer`.

**Q: Где хранится пароль?**  
A: В базе данных в виде bcrypt хеша. Никогда в открытом виде!

---

**Документация обновлена:** 2025-10-24
