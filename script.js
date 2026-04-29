const filterButtons = document.querySelectorAll(".filter-button");
const projectCards = document.querySelectorAll(".project-card");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedFilter = button.dataset.filter;

    filterButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    projectCards.forEach((card) => {
      const shouldShow = selectedFilter === "all" || card.dataset.language === selectedFilter;
      card.classList.toggle("is-hidden", !shouldShow);
    });
  });
});
