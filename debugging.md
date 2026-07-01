# 🐞 Debugging Notebook

## Error #001

### ❌ Error

```bash
nothing added to commit but untracked files present
```

### 📌 Cause

`debugging.md` Git repository-এর বাইরে ছিল।

### ✅ Fix

* File repository-এর ভিতরে এনেছি।
* তারপর:

```bash
git add debugging.md
git commit -m "update"
git push
```

### 💡 Remember

```bash
pwd
ls
git status
```

---

## Error #002

### ❌ Error

```bash
fatal: pathspec 'debugging.md' did not match any files
```

### 📌 Cause

বর্তমান folder-এ `debugging.md` ছিল না।

### ✅ Fix

```bash
ls
```

File আছে কিনা দেখে তারপর `git add debugging.md` চালিয়েছি।

### 💡 Remember

`git add` করার আগে `ls` চালাও।

