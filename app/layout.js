import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "TikTok Scraper App",
  description: "A beautiful web interface for scraping TikTok data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body className={`${nunito.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
