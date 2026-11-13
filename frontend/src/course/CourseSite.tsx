import { useEffect } from 'react';
import { scrollToHashOrTop, useRoute } from './router';
import { Header, Footer } from './components/Layout';
import Home from './pages/Home';
import Enroll from './pages/Enroll';
import PaymentResult from './pages/PaymentResult';
import { Terms, Privacy, Refund, Contact } from './pages/Policies';

export default function CourseSite() {
  const route = useRoute();

  useEffect(() => {
    // Wait a frame so the new page is in the DOM before scrolling to #hash.
    const id = requestAnimationFrame(scrollToHashOrTop);
    return () => cancelAnimationFrame(id);
  }, [route]);

  let page;
  switch (route) {
    case '/enroll': page = <Enroll />; break;
    case '/terms': page = <Terms />; break;
    case '/privacy': page = <Privacy />; break;
    case '/refund': page = <Refund />; break;
    case '/contact': page = <Contact />; break;
    case '/payment/result': page = <PaymentResult />; break;
    default: page = <Home />;
  }

  return (
    <div className="course-site">
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>
        {page}
      </main>
      <Footer />
    </div>
  );
}
