import "./globals.css";

export const metadata = {
  title: "TikTok Scraper App",
  description: "A beautiful web interface for scraping TikTok data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: '"Nunito", system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
