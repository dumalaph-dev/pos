import { redirect } from "next/navigation";

export default function StaffAccessRedirect() {
  redirect("/admin/employees#staff-access");
}
