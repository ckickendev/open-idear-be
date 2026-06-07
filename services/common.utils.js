function convertDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
        return "";
    }
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    return d.toLocaleString('en-US', options);
}

module.exports = { convertDate };

