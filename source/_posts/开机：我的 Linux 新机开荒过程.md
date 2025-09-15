---
title: 开机：我的 Linux 新机开荒过程
category: Linux
tags: [Linux, mixture]
date: 2025-08-29 21:21:34
updated: 2025-09-13 18:27:34
---
游戏本太笨重了，携带实在是多有不便，几经考虑新买了一个笔记本，日常学习和开发用。i5 16G 512G，写点小代码足够，大服务跑不起来就上 ssh。

主力机已经是 Win 系统了（毕竟要玩游戏嘛），开发主要靠 WSL，就想着要不要一步到位，给新机搞个 Linux。

从 Win 到纯 Linux，预计会遇到很多坑，写个文章以做记录。

## 重装 Linux

新机一般都是预装了 Windows 的，需要我们手动重装为 Linux。

1. **下载 Linux 发行版并制作 USB 启动盘**

安装系统需要将 Linux 发行版烧录进 CD，而现在更现代化的做法是下载进 U 盘。

你需要一个 U 盘，8G以上，U 盘原有的内容会被格式化，注意数据保存。

软件 refus 可以完成 USB 启动盘的创建。

配置：分区类型 GPT，目标系统类型 UEFI，文件系统 NTFS

发行版镜像这里选择 Ubuntu 最新 LST 桌面版：https://ubuntu.com/download/desktop

2. **进入 BIOS**

BIOS 会加载各种硬件，并控制电脑操作系统的引导或启动。

把U盘插到电脑上再重启电脑，重启过程中长按 F2（大部分设备）进入BIOS界面。找到“Boot”或“启动”选项卡，将 U盘（USB HDD）设置为第一启动项。

保存并退出，等待安装完成。

3. **Ubuntu 初始设置**

- 更新和第三方软件：勾选“为图形或无线硬件安装第三方软件…”（这将安装一些闭源驱动，如显卡和网卡驱动，如果作为正常电脑建议勾选）。
- 安装类型：为了完全替换 Windows，选择 “清除整个磁盘并安装 Ubuntu” 或 “擦除磁盘并安装 Ubuntu”。
- 其他按个性化需求配置即可

等待一段时间后，安装完成。

## 默认文件夹改回英文

在安装时选择了中文，导致默认文件夹均为中文，如“下载”、“文档”等，终端操作时切换中文输入法较为麻烦。通过以下步骤可以解决：

1. 在终端中依次执行：

```Shell
export LANG=en_US
xdg-user-dirs-gtk-update
```

在弹出的窗口中确认更新名称，此操作会将中文目录名转换为英文。

如果被改名的文件夹中有文件，文件夹会被保留，同时新创建一个英文文件夹，所以不用担心数据丢失。如果内容比较重要或较大，建议还是备份一下。

2. 继续执行：

```Shell
export LANG=zh_CN.UTF-8
xdg-user-dirs-gtk-update
```

在弹出的对话框中选择“保留旧的名称”并勾选“不再询问”，这能阻止系统在下次登录时改回中文。

3. 检查 ~/.config/user-dirs.dirs 文件，确认路径指向是否正确（XDG_DOWNLOAD_DIR="$HOME/Downloads"），不正确可以手动更改。

更改完成。

## **实用软件或工具安装**

以下为一些个人需要的软件，仅供参考。未特别说明的直接到官网下载 Linux 版即可。AppImage 格式双击或者终端运行直接可用，.deb 格式 `apt install` 安装。

### **常用工具**

- 谷歌浏览器：应用商店的是开源版本，不能登陆账号同步数据，需要自行下载。
- QQ，微信
- 腾讯会议，飞书
- 录屏软件：kooha https://github.com/SeaDve/Kooha (Wayland 下正常工作)

```Bash
sudo apt install flatpak
flatpak install https://dl.flathub.org/repo/appstream/io.github.seadve.Kooha.flatpakref
```

- 截图软件：flameshot

**文件互传**

设备之间经常需要互传文件或者文本，这里推荐一个网站 [SnapDrop](https://www.snap-drop.net/)，只需要在浏览器中打开网站，在同一网络下即可配对，互传文件和文本。（也有不同网络下配对的功能）

### **科学上网**

clash 地址：https://clashverge.org/ 按说明选择合适的版本安装即可，这里建议 appimage 版本，直接双击即可使用。如果双击后无反应，用终端打开，可能显示缺少依赖，下载即可。

导入订阅的节点链接，开启系统代理。

出现代理不生效的问题，配置系统网络代理后解决

![](img/linux-new-machine/1280X1280.PNG)

### flameshot 快捷键无效

wayland 下真是问题多多，由于其严格的权限限制，很多录屏、截图软件等和屏幕捕获有关的东西都不能用，或者功能不全。

根据官网配置 flameshot,参考：https://flameshot.org/docs/guide/key-bindings/#linux 配置全局快捷键启动 flame gui 进行截图

命令行中运行 `flame gui` 一切功能正常，但是配置热键无效。

![](img/linux-new-machine/50bf1965-bee0-4964-8728-aed259feb513.png)

经排查在 github 上找到以下讨论

https://github.com/flatpak/xdg-desktop-portal/issues/1070#issuecomment-1771302632

尝试其回答中的方法：

在任意位置创建文件，编写以下脚本：

```Bash
#!/bin/bash
env QT_QPA_PLATFORM=wayland flameshot gui
```

在系统快捷键中设置该脚本为运行命令，经测试有效。

### 视频文件损坏的补救办法

在使用 kazam 录屏使因为断电、误触bug等种种原因，没有正常中断录制，导致视频文件不能正常观看。

搜索一番，发现了解决办法，也可以尝试解决其他软件和原因造成的视频文件损坏。

1. 下载开源视频程序 VLC.
2. 打开VLC，点击媒体 -> 转换/保存

![](img/linux-new-machine/0fea1d9b-3338-4019-ad5f-2f6e8d9ba164.png)
3. 文件选择中添加损坏的视频文件，然后点击转换/保存
4. 转换页面中，选择目标文件，随便选一个输出目录，默认名字与来源文件同名，可以修改。配置文件最好选择与源文件相同的格式。

![](img/linux-new-machine/2d195681-eb39-43ee-8d0d-4322378d499a.png)

5. 点击开始。VLC开始转存，时长一般比原视频的时长短一些，静待完成即可。
