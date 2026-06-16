import { Outfit, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import ModelBadge from "@/components/ModelBadge";
import UserNav from "@/components/UserNav";
import BottomNavigation from "@/components/BottomNavigation";
import ApiActivityFloat from "@/components/ApiActivityFloat";
import Chatbox from "@/components/chat/Chatbox";


const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
  title: "World Cup 2026 AI Predictor & Sports Analytics",
  description: "Dự đoán kết quả, soi kèo bóng đá World Cup 2026 chính xác sử dụng AI Gemini thế hệ mới và tính năng tìm kiếm thông tin thời gian thực Google Search Grounding.",
  keywords: "world cup 2026, ai prediction, du doan bong da, soi keo ai, gemini, google search grounding, keo chau au, tai xiu, keo chap",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={`${outfit.variable} ${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased font-sans pb-[72px] md:pb-0" suppressHydrationWarning>
        




        {/* Navigation Bar (Ẩn trên di động, chỉ hiện trên màn hình lớn) */}
        <header className="hidden md:block sticky top-0 z-50 glass-panel border-b border-card-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              
              {/* Logo */}
              <div className="flex items-center flex-shrink-0">
                <Link href="/" className="flex items-center space-x-2">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center glow-green">
                    <span className="font-extrabold text-white text-lg tracking-wider">AI</span>
                  </div>
                  <span className="font-bold text-xl tracking-tight text-white font-heading">
                    WC2026<span className="text-gradient">PREDICT</span>
                  </span>
                </Link>
              </div>

              {/* Navigation Links */}
              <nav className="hidden md:flex space-x-4 lg:space-x-6 flex-shrink-0">
                <Link 
                  href="/" 
                  className="text-gray-300 hover:text-primary transition-colors duration-200 font-medium text-sm whitespace-nowrap"
                  id="nav-home"
                >
                  Lịch thi đấu
                </Link>
                <Link 
                  href="/custom" 
                  className="text-gray-300 hover:text-secondary transition-colors duration-200 font-medium text-sm whitespace-nowrap"
                  id="nav-custom"
                >
                  Giả lập cặp đấu
                </Link>
                <Link 
                  href="/admin" 
                  className="text-gray-300 hover:text-primary/90 hover:text-primary transition-colors duration-200 font-medium text-sm flex items-center space-x-1 border-l border-card-border/50 pl-4 whitespace-nowrap"
                  id="nav-admin"
                >
                  <span>🛠️</span>
                  <span>Cấu hình AI</span>
                </Link>
              </nav>

              {/* Badge & User Nav */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <ModelBadge />
                <UserNav />
              </div>


            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-card-border bg-[#070A10] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 text-sm text-gray-500">
            <div>
              <p>&copy; 2026 WC2026 AI Predictor. Xây dựng cho kỳ World Cup Mỹ - Canada - Mexico.</p>
            </div>
            <div className="flex space-x-4">
              <span className="hover:text-primary transition-colors cursor-pointer">Điều khoản</span>
              <span className="hover:text-secondary transition-colors cursor-pointer">Bảo mật</span>
              <span className="hover:text-accent transition-colors cursor-pointer">Gemini Search Grounding</span>
            </div>
          </div>
        </footer>

        <BottomNavigation />
        <ApiActivityFloat />
        <Chatbox />

      </body>
    </html>
  );
}
