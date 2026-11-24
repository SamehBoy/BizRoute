import { Header } from "@/components/shell";
import { DemoWorkspace } from "@/components/demo-workspace";

export const metadata = { title: "Interactive demo" };
export default function Demo() {
  return <div className="demo-shell"><Header /><DemoWorkspace /></div>;
}
