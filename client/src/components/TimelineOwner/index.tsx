import { mdiEmail, mdiGithub, mdiWebBox } from "@mdi/js";
import Icon from "@mdi/react";

import config from "../../../../configs/client";

export interface TimelineOwnerProps {
  className?: string;
  iconClassName?: string;
}

const { homepage, email, github } = config;

export default function TimelineOwner(props: TimelineOwnerProps) {
  const { className = "", iconClassName = "", ...rest } = props;

  return (
    <div className={`flex gap-4 ${className}`} {...rest}>
      {[
        { key: homepage, url: homepage, icon: mdiWebBox },
        { key: github, url: github, icon: mdiGithub },
        { key: email, url: `mailto:${email}`, icon: mdiEmail },
      ].map(
        (item) =>
          item.key && (
            <a key={item.key} href={item.url} target="_blank">
              <Icon
                path={item.icon}
                className={`text-background-lighter hover:text-foreground size-6 transition ${iconClassName}`}
              />
            </a>
          ),
      )}
    </div>
  );
}
