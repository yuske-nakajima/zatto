import logo from "../../src/web/assets/zatto-logo-black.png";

interface BrandLogoProps {
  width: number;
}

export function BrandLogo({ width }: BrandLogoProps) {
  return (
    <img
      alt="zatto"
      src={logo}
      style={{ display: "block", height: "auto", width }}
    />
  );
}
