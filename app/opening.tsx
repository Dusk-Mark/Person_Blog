"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export default function Opening() {
  const dialog = useRef<HTMLDialogElement>(null);
  // 进入站点时播放开场动画：期间锁定页面滚动，3.6 秒后自动关闭；
  // 用户点击跳过，或系统开启“减少动效”时都不再播放。
  useEffect(() => {
    const element = dialog.current;
    if (
      !element ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restore = () => {
      document.body.style.overflow = overflow;
    };
    element.addEventListener("close", restore);
    const timer = window.setTimeout(() => element.close(), 3600);
    return () => {
      clearTimeout(timer);
      element.removeEventListener("close", restore);
      element.close();
      restore();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="opening"
      aria-label="欢迎来到 NILING_DUSK 的博客"
    >
      <Image
        className="opening-art"
        src="/开场动画.png"
        alt="暮色中的城市、加密货币与工程世界"
        fill
        sizes="100vw"
        preload
      />
      <div className="opening-shade" />
      <div className="opening-brand">
        <span>WELCOME TO MY WORLD</span>
        <h1>NILING_DUSK</h1>
        <p>记录思考，让成长发生。</p>
        <div className="opening-progress" />
      </div>
      <button
        autoFocus
        className="opening-skip"
        onClick={() => dialog.current?.close()}
      >
        进入博客 / 跳过 ↗
      </button>
    </dialog>
  );
}
