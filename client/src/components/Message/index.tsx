import {
  mdiAlertBox,
  mdiCheckboxMarked,
  mdiCloseBox,
  mdiInformationBox,
} from "@mdi/js";
import Icon from "@mdi/react";
import { useCallback, useEffect, useState } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { v4 as uuid } from "uuid";

export interface MessageContainerProps {
  maxMessageNum?: number;
  dismissTimeout?: number;
  dismissOnClick?: boolean;
}

export interface MessageAPI {
  info: (text: string) => void;
  success: (text: string) => void;
  warning: (text: string) => void;
  error: (text: string) => void;
}

interface Message {
  key: string;
  type: "info" | "success" | "warning" | "error";
  text: string;
}

let addMessage: (message: Message) => void;

function MessageItem(props: Message & React.HTMLAttributes<HTMLDivElement>) {
  const { key, type = "info", text, className, ...rest } = props;

  let borderColor: string;
  let shadowColor: string;
  let iconPath: string;
  let iconColor: string;
  switch (type) {
    case "error":
      borderColor = "border-red-400/30";
      shadowColor = "shadow-red-400/30";
      iconPath = mdiCloseBox;
      iconColor = "text-red-400";
      break;
    case "success":
      borderColor = "border-green-400/30";
      shadowColor = "shadow-green-400/30";
      iconPath = mdiCheckboxMarked;
      iconColor = "text-green-400";
      break;
    case "warning":
      borderColor = "border-orange-400/30";
      shadowColor = "shadow-orange-400/30";
      iconPath = mdiAlertBox;
      iconColor = "text-orange-400";
      break;
    case "info":
    default:
      borderColor = "border-blue-400/30";
      shadowColor = "shadow-blue-400/30";
      iconPath = mdiInformationBox;
      iconColor = "text-blue-400";
  }

  return (
    <div
      className={`border-1 bg-background-lighter flex w-fit max-w-96 items-center rounded px-3 py-2 shadow ${borderColor} ${shadowColor} ${className}`}
      data-message-key={key}
      {...rest}
    >
      <Icon
        path={iconPath}
        size={1}
        className={`${iconColor} mr-3 shrink-0 grow-0`}
      />
      <span>{text}</span>
    </div>
  );
}

export function MessageContainer(props: MessageContainerProps) {
  const {
    maxMessageNum = 5,
    dismissTimeout = 3000,
    dismissOnClick = true,
  } = props;
  const [messages, setMessages] = useState<Message[]>([]);

  const removeMessage = useCallback((message: Message) => {
    const { key } = message;
    setMessages((prev) => prev.filter((item) => item.key !== key));
  }, []);

  useEffect(() => {
    addMessage = (message) => {
      setMessages((prev) => [...prev, message]);
      setTimeout(() => {
        removeMessage(message);
      }, dismissTimeout);
    };
  }, [dismissTimeout, removeMessage]);

  useEffect(() => {
    if (messages.length > maxMessageNum) {
      removeMessage(messages[0]);
    }
  }, [maxMessageNum, messages, removeMessage]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-50">
      <TransitionGroup>
        {messages.map((message) => (
          <CSSTransition
            key={message.key}
            addEndListener={() => {}}
            classNames="fade-y"
            timeout={150}
            unmountOnExit
          >
            <MessageItem
              key={message.key}
              type={message.type}
              text={message.text}
              className={`pointer-events-auto mx-auto mb-4 ${dismissOnClick ? "cursor-pointer" : ""}`}
              onClick={() => {
                if (dismissOnClick) removeMessage(message);
              }}
            />
          </CSSTransition>
        ))}
      </TransitionGroup>
    </div>
  );
}

const message: MessageAPI = {
  info: (text) => {
    addMessage({ key: uuid(), type: "info", text });
  },
  success: (text) => {
    addMessage({ key: uuid(), type: "success", text });
  },
  warning: (text) => {
    addMessage({ key: uuid(), type: "warning", text });
  },
  error: (text) => {
    addMessage({ key: uuid(), type: "error", text });
  },
};

export default message;
