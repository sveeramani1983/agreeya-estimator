import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { SaveStatusProvider } from "@/components/save-status-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skynet 1.0 Beta",
  description: "Modern estimation tool for internal business use.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className={`${inter.variable} ${plusJakartaSans.variable} h-full bg-[#0A0F1E] font-sans`}>
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar />
              <SaveStatusProvider>
              <SidebarInset className="flex flex-col bg-transparent overflow-hidden">
                <AppHeader />
                <main className="flex-1 overflow-y-auto p-6">
                  <div className="mx-auto w-full min-w-[1200px] max-w-[1600px]">
                    {children}
                  </div>
                </main>
              </SidebarInset>
              </SaveStatusProvider>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster position="top-right" closeButton richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
