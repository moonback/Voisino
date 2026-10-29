import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function UserAvatar({ name, image, className }: { name: string; image: string | null | undefined; className?: string }) {
  return (
    <Avatar className={cn("size-10", className)}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-brand-soft font-semibold text-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
