import {render,screen} from "@testing-library/react";import {describe,expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/osint"}));vi.mock("next/link",()=>({default:(p:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...p}/> }));
import {ShellNav} from "@/components/shell-nav";
describe("OSINT navigation",()=>{it("is a top-level active destination",()=>{render(<ShellNav/>);expect(screen.getByRole("link",{name:/OSINT/})).toHaveAttribute("href","/osint");expect(screen.getByRole("link",{name:/OSINT/})).toHaveAttribute("aria-current","page")})});
