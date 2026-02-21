# 🚀 School Management System - Deployment Guide

## Overview
Yeh project **2 parts** mein deploy hoga:
1. **Frontend** → Vercel (HTML/CSS/JS files)
2. **Backend** → Render (Node.js server + MySQL database)

---

## 📋 Prerequisites

### 1. GitHub Account
- GitHub account banao agar nahi hai
- Apna project GitHub pe push karo

### 2. Accounts Banao
- **Vercel Account**: https://vercel.com/signup (GitHub se login karo)
- **Render Account**: https://render.com/register (GitHub se login karo)

---

## 🎯 STEP 1: GitHub Pe Code Upload Karo

### Option A: Git Command Line
```bash
# Terminal mein ye commands run karo
cd "d:\All Projects\School Management System\PROJECT"

# Git initialize karo (agar pehle se nahi hai)
git init

# Files add karo
git add .

# Commit karo
git commit -m "Initial commit - School Management System"

# GitHub pe repository banao aur remote add karo
git remote add origin https://github.com/YOUR_USERNAME/school-management-system.git

# Push karo
git branch -M main
git push -u origin main
```

### Option B: GitHub Desktop (Easier)
1. GitHub Desktop download karo
2. "Add Local Repository" pe click karo
3. Apna project folder select karo
4. "Publish Repository" pe click karo

---

## 🖥️ STEP 2: Backend Deploy Karo (Render)

### 1. Render Dashboard Pe Jao
- https://dashboard.render.com pe jao
- "New +" button pe click karo
- "Blueprint" select karo

### 2. Repository Connect Karo
- Apni GitHub repository select karo
- `render.yaml` file automatically detect ho jayegi

### 3. Database Setup
- Render automatically MySQL database create karega
- Database credentials automatically backend ko mil jayenge

### 4. Deploy Karo
- "Apply" button pe click karo
- Wait karo 5-10 minutes (pehli deployment slow hoti hai)
- Deploy hone ke baad aapko URL milega jaise:
  ```
  https://school-management-backend.onrender.com
  ```

### 5. Backend URL Copy Karo
- Yeh URL aapko frontend mein use karna hai

---

## 🌐 STEP 3: Frontend Deploy Karo (Vercel)

### 1. Vercel Dashboard Pe Jao
- https://vercel.com/dashboard pe jao
- "Add New Project" pe click karo

### 2. Repository Import Karo
- Apni GitHub repository select karo
- "Import" pe click karo

### 3. Configuration
- **Framework Preset**: Other
- **Root Directory**: ./
- **Build Command**: (leave empty)
- **Output Directory**: ./

### 4. Environment Variables (IMPORTANT!)
- "Environment Variables" section mein jao
- Add karo:
  ```
  Name: VITE_API_URL
  Value: https://school-management-backend.onrender.com
  ```
  (Yahan apna Render backend URL paste karo)

### 5. Deploy Karo
- "Deploy" button pe click karo
- 2-3 minutes mein deploy ho jayega
- Aapko URL milega jaise:
  ```
  https://school-management-system.vercel.app
  ```

---

## 🔧 STEP 4: Frontend Ko Backend Se Connect Karo

### Update script.js
Apni `script.js` file mein yeh changes karo:

```javascript
// Top of the file mein add karo
const API_URL = 'https://school-management-backend.onrender.com';

// Jahan bhi API calls hain, wahan update karo:
// Pehle:
fetch('/api/students')

// Ab:
fetch(`${API_URL}/api/students`)
```

### Changes Push Karo
```bash
git add .
git commit -m "Connected frontend to backend"
git push
```

Vercel automatically redeploy kar dega!

---

## ✅ STEP 5: Testing

### 1. Backend Test Karo
```
https://YOUR-BACKEND-URL.onrender.com/api/students
```
Yeh empty array return karega: `[]`

### 2. Frontend Test Karo
```
https://YOUR-FRONTEND-URL.vercel.app
```
Website open honi chahiye!

---

## 🐛 Common Issues & Solutions

### Issue 1: "This Serverless Function has crashed"
**Solution**: Yeh Vercel pe backend deploy karne ki koshish kar rahe the. Ab sirf frontend deploy ho raha hai, backend Render pe hai.

### Issue 2: Backend slow hai
**Solution**: Render free tier pe backend 15 minutes inactivity ke baad sleep mode mein chala jata hai. Pehli request slow hogi (30 seconds), phir fast ho jayega.

### Issue 3: Database connection error
**Solution**: 
- Render dashboard mein jao
- Database credentials check karo
- Environment variables sahi set hain ya nahi verify karo

### Issue 4: CORS Error
**Solution**: `server.js` mein already CORS enabled hai. Agar phir bhi error aaye to:
```javascript
app.use(cors({
  origin: 'https://YOUR-VERCEL-URL.vercel.app'
}));
```

---

## 📱 Final URLs

Deployment ke baad aapke paas 2 URLs honge:

1. **Frontend (Users ke liye)**:
   ```
   https://school-management-system.vercel.app
   ```

2. **Backend API (Internal use)**:
   ```
   https://school-management-backend.onrender.com
   ```

---

## 💰 Cost

- **Vercel**: FREE (unlimited deployments)
- **Render**: FREE tier available
  - Backend: 750 hours/month free
  - Database: 90 days free trial, phir $7/month

---

## 🔄 Future Updates

Jab bhi code update karna ho:

```bash
git add .
git commit -m "Your update message"
git push
```

Dono platforms (Vercel & Render) automatically redeploy kar denge!

---

## 📞 Support

Agar koi issue aaye to:
1. Render logs check karo: Dashboard → Your Service → Logs
2. Vercel logs check karo: Dashboard → Your Project → Deployments → View Logs
3. Browser console check karo (F12)

---

## 🎉 Congratulations!

Aapka School Management System ab live hai! 🚀

**Next Steps**:
- Custom domain add karo (optional)
- SSL certificate automatic hai (HTTPS)
- Monitoring setup karo
- Backup strategy banao
