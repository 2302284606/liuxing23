#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GitHub 仓库同步工具
用于自动化管理代码的上传（Push）和下载（Pull）
"""

import subprocess
import os
import sys
from datetime import datetime

def print_separator():
    """打印分隔线"""
    print("=" * 60)

def print_success(message):
    """打印成功消息"""
    print(f"✅ {message}")

def print_error(message):
    """打印错误消息"""
    print(f"❌ {message}")

def print_info(message):
    """打印信息消息"""
    print(f"ℹ️ {message}")

def run_git_command(command, check=False):
    """
    运行 Git 命令
    返回 (returncode, stdout, stderr)
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return -1, "", str(e)

def check_git_status():
    """检查当前 Git 状态"""
    print_separator()
    print_info("检查当前 Git 状态...")
    
    # 检查是否有未提交的改动
    code, stdout, stderr = run_git_command("git status --porcelain")
    
    if code != 0:
        print_error(f"无法获取 Git 状态: {stderr}")
        return False, []
    
    changes = [line for line in stdout.split('\n') if line.strip()]
    
    if changes:
        print_info(f"发现 {len(changes)} 个待提交的改动:")
        for change in changes[:5]:  # 只显示前5个
            print(f"   {change}")
        if len(changes) > 5:
            print(f"   ... 还有 {len(changes) - 5} 个改动")
        return True, changes
    else:
        print_success("当前工作区干净，没有待提交的改动")
        return False, []

def get_default_commit_message():
    """生成默认的提交信息"""
    now = datetime.now()
    return f"Update: {now.strftime('%Y-%m-%d %H:%M')}"

def push():
    """快速上传代码"""
    print_separator()
    print_info("🚀 开始上传操作...")
    
    # 检查是否有改动
    has_changes, changes = check_git_status()
    
    if not has_changes:
        print_info("无需更新，当前代码已是最新状态")
        return
    
    # 执行 git add .
    print_info("执行 git add .")
    code, stdout, stderr = run_git_command("git add .")
    
    if code != 0:
        print_error(f"git add 失败: {stderr}")
        return
    
    # 获取提交信息
    default_msg = get_default_commit_message()
    print_separator()
    print(f"请输入提交信息 (直接回车使用默认: '{default_msg}'):")
    commit_msg = input("> ").strip()
    
    if not commit_msg:
        commit_msg = default_msg
    
    # 执行 git commit
    print_info(f"执行 git commit -m '{commit_msg}'")
    code, stdout, stderr = run_git_command(f'git commit -m "{commit_msg}"')
    
    if code != 0:
        print_error(f"git commit 失败: {stderr}")
        return
    
    print_success("代码提交成功")
    
    # 执行 git push
    print_info("执行 git push")
    code, stdout, stderr = run_git_command("git push -u origin main")
    
    if code != 0:
        print_error(f"git push 失败")
        
        # 分析错误原因
        if "non-fast-forward" in stderr:
            print_error("本地版本落后于远程，请先执行 Pull 操作")
        elif "permission denied" in stderr.lower() or "403" in stderr:
            print_error("权限不足，请检查 GitHub 访问权限")
        elif "timeout" in stderr.lower():
            print_error("网络超时，请检查网络连接")
        elif "conflict" in stderr.lower():
            print_error("存在合并冲突，请手动解决后再推送")
        else:
            print_error(f"详细错误: {stderr}")
        return
    
    print_success("🚀 代码上传成功！")

def pull():
    """强制拉取代码"""
    print_separator()
    print_info("📥 开始拉取操作...")
    
    # 检查是否有未提交的改动
    has_changes, changes = check_git_status()
    
    if has_changes:
        print_separator()
        print_error("检测到本地有未提交的改动！")
        print_info("请选择操作:")
        print("   1. 先提交本地改动")
        print("   2. 暂存本地改动 (git stash)")
        print("   3. 取消操作")
        
        choice = input("请输入选项 (1/2/3): ").strip()
        
        if choice == "1":
            push()
            return
        elif choice == "2":
            print_info("执行 git stash")
            code, stdout, stderr = run_git_command("git stash")
            if code != 0:
                print_error(f"git stash 失败: {stderr}")
                return
            print_success("本地改动已暂存")
        else:
            print_info("操作已取消")
            return
    
    # 执行 git pull
    print_info("执行 git pull")
    code, stdout, stderr = run_git_command("git pull --rebase origin main")
    
    if code != 0:
        print_error(f"git pull 失败")
        
        # 分析错误原因
        if "conflict" in stderr.lower():
            print_error("存在合并冲突，请手动解决")
        elif "permission denied" in stderr.lower() or "403" in stderr:
            print_error("权限不足，请检查 GitHub 访问权限")
        elif "timeout" in stderr.lower():
            print_error("网络超时，请检查网络连接")
        else:
            print_error(f"详细错误: {stderr}")
        return
    
    print_success("📥 代码拉取成功！")
    
    # 如果有暂存的改动，询问是否恢复
    code, stash_list, _ = run_git_command("git stash list")
    if code == 0 and stash_list:
        print_separator()
        print_info("检测到暂存的改动，是否恢复？ (y/n)")
        if input("> ").strip().lower() == "y":
            code, stdout, stderr = run_git_command("git stash pop")
            if code == 0:
                print_success("暂存的改动已恢复")
            else:
                print_error(f"恢复暂存改动失败: {stderr}")

def main():
    """主函数"""
    print_separator()
    print("    GitHub 仓库同步工具")
    print_separator()
    
    # 检查是否在 Git 仓库中
    if not os.path.exists(".git"):
        print_error("当前目录不是 Git 仓库！")
        print_info("请先在当前目录初始化 Git 仓库")
        return
    
    while True:
        print_separator()
        print("请选择操作:")
        print("   1. 🚀 快速上传 (Push)")
        print("   2. 📥 拉取更新 (Pull)")
        print("   3. 📋 检查状态 (Status)")
        print("   4. 退出")
        
        choice = input("\n请输入选项 (1-4): ").strip()
        
        if choice == "1":
            push()
        elif choice == "2":
            pull()
        elif choice == "3":
            check_git_status()
        elif choice == "4":
            print_success("感谢使用，再见！")
            break
        else:
            print_error("无效的选项，请重新输入")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n" + "=" * 60)
        print_success("程序已中断，再见！")
    except Exception as e:
        print_error(f"程序出错: {str(e)}")
