export function NavItem({ label, icon: Icon, iconRight, active, onClick }) {
  return (
    <div onClick={onClick} className={`pp-navitem${active ? " is-active" : ""}`}>
      {!iconRight && Icon && <Icon size={15} />}
      {label}
      {iconRight && Icon && <Icon size={14} />}
    </div>
  );
}
