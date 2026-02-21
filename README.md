# 🎓 School Management System

A comprehensive, full-stack school management system built with modern web technologies. Manage students, teachers, staff, finances, and more with real-time synchronization.

![School Management System](https://img.shields.io/badge/Status-Production%20Ready-success)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node](https://img.shields.io/badge/Node.js-v16+-green)

## ✨ Features

### 👨‍🎓 Student Management
- Complete student registration with detailed information
- Class assignment and roll number generation
- Fee management with payment tracking
- Student portal for viewing personal information

### 👨‍🏫 Teacher Management
- Teacher registration and profile management
- Subject and class assignment
- Salary tracking and payment history
- Teacher portal with attendance marking

### 💰 Financial Management
- Monthly fee collection tracking
- Expense management (Electricity, Gas, Internet, Rent)
- Bill payment confirmation with receipt uploads
- Revenue analytics and reporting

### 📊 Dashboard & Analytics
- Real-time statistics
- Student enrollment trends
- Fee collection status
- Staff overview

### 🔔 Notification System
- Real-time notifications for important events
- Login activity tracking
- Student/Teacher updates alerts

### 🔐 Security
- Role-based access control (Admin, Teacher, Student)
- Secure authentication system
- Login history tracking

## 🛠️ Tech Stack

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with custom properties
- **JavaScript (ES6+)** - Interactive functionality
- **Lucide Icons** - Beautiful icon library

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **Sequelize** - ORM for database management
- **MySQL** - Relational database

### Deployment
- **Vercel** - Frontend hosting
- **Render** - Backend hosting with MySQL database

## 🚀 Quick Start

### Prerequisites
- Node.js v16 or higher
- MySQL Server
- Git

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/YOUR_USERNAME/school-management-system.git
cd school-management-system
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Create a `.env` file:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=school_system
PORT=3000
```

4. **Start the backend server**
```bash
npm start
```

5. **Open the application**
Open `index.html` in your browser or use a local server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server
```

6. **Login**
- **Admin Email:** Apexiums@school.com
- **Password:** Apexiums1717

## 📦 Deployment

### Deploy to Production

Follow the detailed deployment guide in [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)

**Quick Deploy:**
1. Deploy backend to [Render](https://render.com)
2. Deploy frontend to [Vercel](https://vercel.com)
3. Update backend URL in `script.js`

See [`QUICK_DEPLOY.md`](QUICK_DEPLOY.md) for step-by-step commands.

## 📁 Project Structure

```
school-management-system/
├── index.html              # Landing page
├── dashboard.html          # Admin dashboard
├── students.html           # Student management
├── teachers.html           # Teacher management
├── staff.html             # Staff management
├── finance.html           # Financial management
├── fees.html              # Fee tracking
├── settings.html          # System settings
├── student_portal.html    # Student portal
├── teacher_portal.html    # Teacher portal
├── style.css              # Global styles
├── script.js              # Frontend logic
├── server.js              # Backend API server
├── package.json           # Node.js dependencies
├── render.yaml            # Render deployment config
├── vercel.json            # Vercel deployment config
└── .env                   # Environment variables (not in repo)
```

## 🎨 Features Showcase

### Real-time Synchronization
- Automatic data sync across all connected clients
- Socket.IO powered live updates
- LocalStorage fallback for offline capability

### Responsive Design
- Mobile-friendly interface
- Adaptive layouts for all screen sizes
- Touch-optimized controls

### Modern UI/UX
- Clean and intuitive interface
- Smooth animations and transitions
- Professional color scheme (Teal/Turquoise theme)

## 🔧 Configuration

### Database Setup
The application automatically creates the required database and tables on first run.

### Customization
- Update school name in `settings.html`
- Modify color scheme in `style.css` (CSS variables)
- Add custom subjects/classes in the admin panel

## 📊 Database Schema

### Students Table
- ID, Full Name, Father Name, Class, Roll Number
- Contact Information, Form-B Number
- Fee Details, Payment Status
- Login Credentials

### Teachers Table
- ID, Full Name, Father Name, CNIC
- Contact Information, Address
- Qualification, Subject, Salary
- Login Credentials

### Bills Table
- Category, Amount, Date, Status
- Invoice and Receipt Images
- Payment Confirmation Details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Apexiums System**
- Website: [Your Website]
- Email: Apexiums@school.com

## 🙏 Acknowledgments

- Lucide Icons for beautiful iconography
- Socket.IO for real-time capabilities
- Sequelize for elegant database management
- Vercel & Render for reliable hosting

## 📞 Support

For support, email Apexiums@school.com or create an issue in this repository.

---

**Made with ❤️ by Apexiums System**
# Task
