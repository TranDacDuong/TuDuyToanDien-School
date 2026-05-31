(function(){

  const popup     = document.getElementById("createClassPopup");
  const openBtn   = document.getElementById("openCreateClass");
  const closeBtn  = document.getElementById("closeCreatePopup");
  const filterBar = document.getElementById("filterBar");
  const filters   = document.getElementById("classFilters");

  function getSb(){ return window.sb || sb; }

  async function init(){
    try{
      const qs = new URLSearchParams(location.search);
      const openClassId = qs.get("openClassId");
      const openTab = qs.get("tab");
      const { data:{ user } } = await getSb().auth.getUser();
      if(!user) return;

      const { data: profile } = await getSb()
        .from("users").select("role,full_name").eq("id", user.id).maybeSingle();

      /* Set global — class_list.js đọc từ đây */
      window._currentRole     = profile?.role || "student";
      window._currentUserId   = user.id;
      window._currentUserName = profile?.full_name || "";

      const userInfo = document.getElementById("userInfo");
      if(userInfo){
        const roleLabel = { admin:"Quản trị viên", teacher:"Giáo viên", student:"Học sinh" };
        userInfo.textContent = (profile?.full_name||"") + " · " + (roleLabel[profile?.role]||"");
      }

      const role = profile?.role;

      if(role === "admin"){
        /* Admin: hiện filter bar + nút tạo lớp */
        if(openBtn)   openBtn.style.display = "";
        if(filters)   filters.style.display = "contents";
        if(filterBar) filterBar.style.display = "none"; /* class_list sẽ bật sau khi load */
      } else if(role === "teacher"){
        /* Teacher: hiện nút tạo lớp trong khối thao tác gọn */
        if(openBtn)   openBtn.style.display = "";
        if(filters)   filters.style.display = "none";
        if(filterBar) filterBar.style.display = "flex";
      } else {
        /* Student: ẩn khối tạo lớp và bộ lọc */
        if(openBtn)   openBtn.style.display   = "none";
        if(filters)   filters.style.display   = "none";
        if(filterBar) filterBar.style.display = "none";
        if(popup)     popup.style.display     = "none";
      }

      /* Gọi load AFTER set role+uid */
      if(window.loadMyClasses) window.loadMyClasses();

      if(openClassId && window.openClassView){
        setTimeout(async () => {
          await window.openClassView(openClassId, qs.get("className") || "Chi tiết lớp");
          if(openTab === "exams" && window.cvSwitchTab){
            setTimeout(() => window.cvSwitchTab("exams"), 250);
          }
        }, 400);
      }

    }catch(e){ console.error(e); }
  }

  if(openBtn){
    openBtn.onclick = () => {
      popup.classList.remove("hidden");
      if(window.resetClassForm) window.resetClassForm();
    };
  }
  if(closeBtn){
    closeBtn.onclick = () => popup.classList.add("hidden");
  }

  init();
})();
