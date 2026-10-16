const CURRENT_YEAR = new Date().getFullYear();

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p>&copy; {CURRENT_YEAR} Village Drop. Delivering to every doorstep.</p>
      </div>
    </footer>
  );
};

export default Footer;
