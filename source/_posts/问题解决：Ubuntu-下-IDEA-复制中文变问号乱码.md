---
title: 问题解决：Ubuntu 下 IDEA 复制中文变问号乱码
date: 2026-04-23 11:30:33
category: Debug
tags: [debug, Linux, Wayland, IDEA]
---
## 问题描述

在 **Ubuntu** 系统中（**Wayland 桌面协议**），使用最新版的 **IntelliJ IDEA 2026.1** 开发时，遇到了一个极其诡异的复制粘贴问题：从 IDEA 中复制一段包含中文的代码或文字，粘贴到 Chrome 浏览器、VS Code 时，中文全部变成了问号 `??????`。但是如果先粘贴到 Ubuntu 自带的文本编辑器，显示又是正常的；再从编辑器二次复制粘贴到浏览器，中文也正常。

虽然也能用，但是这种“中间商赚差价”的操作还是有点影响效率，本着刨根究底的心态开始了问题定位。

## 问题定位

通过底层工具 `xclip` 对剪贴板格式进行检查，发现这段复制内容中包含了十几种格式：

```Bash
JAVA_DATATRANSFER_COOKIE_***
text/plain;charset=US-ASCII
text/html;charset=UTF-16LE
text/html;charset=UTF-16
STRING
...
text/html;charset=US-ASCII
text/plain;charset=UTF-8
text/plain;charset=utf-16
...
TARGETS
TIMESTAMP
```

把范围大概缩小到编码上了，IDEA 输出了多种格式，而部分接收方错误的选择了其中不支持中文的一些格式。接下来尝试了以下几种方案：

1. 禁用 IDEA 的“富文本复制”（Copy as rich text）。*—— 无效，依然乱码。*
2. VM Options 强制指定 `file.encoding=UTF-8`。*—— 无效*
3. 考虑到 Linux 兼容性里最常见的显示协议问题，将显示模式从 **Wayland** 换成 **Xorg**。*——* ***成功***

但为了一个软件换整个系统的协议肯定是下下策，考虑其他解决办法和根本原因。

**最后找到了这样一个issue：https://youtrack.jetbrains.com/issue/JBR-10186/Clipboard-corrupts-multi-byte-characters**

> gemini 的联网搜索能力还是强

## 根本原因

IDEA 2026.1 版本引入了一个重大的底层变化：**默认开启了原生 Wayland 支持 (WLToolkit)**。而 Wayland 规范并没有规定提供的 MIME 类型必须按优先级顺序排列，但许多应用程序和工具包会默认选择第一个。而 JBR 中的实现使用了 HashSet,没有对这些编码从更高兼容到低兼容进行排序。又因为存在更多 Unicode 格式（如 utf-8 的各种拼写、utf-16 的 be/le、utf-32 等），HashSet 中的排序只是有很小的概率会将非 Unicode 格式放在 Unicode 格式之前，导致该问题并不普遍。

## 解决方法

### 方案 A：强制回退到 X11 兼容模式

1. 在 IDEA 中打开：`Help` -> `Edit Custom VM Options...`。
2. 在末尾添加：`-Dawt.toolkit.name=x11Toolkit`
3. 重启 IDEA。

### 方案 B：更换已修复该 Bug 的 JBR（根本解决）

根据 JetBrains YouTrack (Issue **JBR-10186**) 的最新进展，可以通过更换经过补丁修复的 JBR 来解决。更换 JBR 参考：https://www.jetbrains.com/help/idea/switching-boot-jdk.html

1. 下载 JBR：https://cache-redirector.jetbrains.com/intellij-jbr/jbr_jcef-25.0.2-linux-x64-b401.tar.gz 并解压
2. 在 IDEA 中转到“帮助 | 查找操作…” （Help | Find Action…）或按 Ctrl+Shift+A
3. 找到并选择“为 IDE 选择启动 Java 运行时环境…”（Choose Boot Java Runtime for the IDE…）
4. 更改 JBR 到解压目录
5. 重启 IDE

问题解决！