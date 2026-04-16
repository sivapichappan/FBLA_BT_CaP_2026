import Header from './Header';
import Footer from './Footer';
import AiChatWidget from './AiChatWidget';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <AiChatWidget />
    </div>
  );
};

export default Layout;
