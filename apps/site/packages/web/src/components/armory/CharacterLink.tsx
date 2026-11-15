import { Link } from "react-router-dom";
import { ClassIcon } from "@/components/ClassIcon";
import { armoryPath } from "@/lib/armory";
import { cn } from "@/lib/cn";
import { CLASS_COLORS } from "@/lib/ladder";

/** A character name that opens its armory page, optionally with the class icon. */
export function CharacterLink({
  name,
  wowClass,
  withIcon = false,
  className,
}: {
  name: string;
  wowClass?: string;
  withIcon?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={armoryPath(name)}
      className={cn("inline-flex items-center gap-1.5 font-bold hover:underline", className)}
      style={wowClass === undefined ? undefined : { color: CLASS_COLORS[wowClass] }}
    >
      {withIcon && wowClass !== undefined && <ClassIcon wowClass={wowClass} className="size-5" />}
      {name}
    </Link>
  );
}
