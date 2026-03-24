(function(){

  const popup     = document.getElementById("createClassPopup");
  const openBtn   = document.getElementById("openCreateClass");
  const closeBtn  = document.getElementById("closeCreatePopup");
  const filterBar = document.getElementById("filterBar");
  const toolbar   = document.querySelector(".toolbar");

  function getSb(){ return window.sb || sb; }

  async function init(){
    try{
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
        if(toolbar)   toolbar.style.display = "";
        if(filterBar) filterBar.style.display = "none"; /* class_list sẽ bật sau khi load */
      } else if(role === "teacher"){
        /* Teacher: hiện nút tạo lớp, ẩn filter bar */
        if(openBtn)   openBtn.style.display = "";
        if(toolbar)   toolbar.style.display = "";
        if(filterBar) filterBar.style.display = "none";
      } else {
        /* Student: ẩn hết toolbar/create */
        if(toolbar)   toolbar.style.display   = "none";
        if(openBtn)   openBtn.style.display   = "none";
        if(filterBar) filterBar.style.display = "none";
        if(popup)     popup.style.display     = "none";
      }

      /* Gọi load AFTER set role+uid */
      if(window.loadMyClasses) window.loadMyClasses();

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
