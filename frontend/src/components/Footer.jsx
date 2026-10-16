const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <p>&copy; {year} Village Drop. Delivering to every doorstep.</p>
      </div>
    </footer>
  );
};

export default Footer;
