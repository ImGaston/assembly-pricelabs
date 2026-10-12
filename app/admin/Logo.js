// Hub's secondary logo; swaps for dark mode via CSS vars in styles.js.
export default function Logo() {
  return (
    <>
      <img className="logo-light" src="/admin/RevFactor_SecondaryLogo_Cedar.png" alt="RevFactor" />
      <img className="logo-dark" src="/admin/RevFactor_SecondaryLogo_Bone.png" alt="RevFactor" />
    </>
  );
}
