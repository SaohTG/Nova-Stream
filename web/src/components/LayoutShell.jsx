// web/src/components/LayoutShell.jsx
import { Outlet } from "react-router-dom";
import Layout from "./Layout.jsx";

export default function LayoutShell() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
