---
title: c#读取Excel和读写txt
date: 2023-11-07 17:44:04
tags: 项目
categories: 开发
description: c#读取Excel，按钮选择文件和文件夹以及读写txt
---

# 安装NPOI
1. vs-工具-NuGet程序包管理器-管理解决方案的NuGet程序包
2. 搜索NPOI下载并安装

注：若编译器报错可选择较低版本

# 选择文件
```C#
        private string SelectFolder1(TextBox tb)
        {
            string ret = "";
            System.Windows.Forms.OpenFileDialog dialog = new System.Windows.Forms.OpenFileDialog();
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                tb.Text = dialog.FileName;
            }
            return ret;
        }
```

# 选择文件夹
```C#
        private string SelectFolder2(TextBox tb)
        {
            string ret = "";
            System.Windows.Forms.FolderBrowserDialog dialog = new System.Windows.Forms.FolderBrowserDialog();
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                tb.Text = dialog.SelectedPath;
            }
            return ret;
        }
```
# 读取Excel
```C#
private void transform_Click(object sender, EventArgs e)
{
    using (FileStream fs = new FileStream(excel_folder.Text, FileMode.Open, FileAccess.Read))
    {
            XSSFWorkbook workBook = new XSSFWorkbook(fs);
            ISheet sheet = workBook.GetSheetAt(0);//读取Excel的第一个sheet
            eventName = sheet.GetRow(r).GetCell(4).ToString().Replace(" ", "");//读取Excel r行4列数据，并除去空格
    }
}
```
# 读取txt
```c#
FileStream fs = new FileStream(@"1.TXT", FileMode.CreateOrOpen, FileAccess.Read);
StreamReader sr = new StreamReader(fs, Encoding.GetEncoding("UTF-8"));
sr.ReadLine();
sr.close();
fs.close();
```
# 写入txt
```c#
FileStream fs = new FileStream(@"1.TXT", FileMode.Create, FileAccess.Write);
StreamWriter sw = new StreamWriter(fs, Encoding.GetEncoding("UTF-8"));
sw.WriteLine("1");
sw.close();
fs.close();
```